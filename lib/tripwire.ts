import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { env } from "./env";
import { generateEmbedding } from "./embeddings";
import { retrieveCandidateAssumptions } from "./vector-search";
import { classifyRelationship } from "./classifier";
import { decidePolicy } from "./policy-engine";
import {
  findCurrentDecision,
  applyIntervention,
} from "./repositories/decisions";
import { setAssumptionStatus } from "./repositories/assumptions";
import { findEventByIdempotencyKey, insertEvent } from "./repositories/events";
import type { DecisionDoc, EventDoc, Intervention } from "./types";

export interface TripwireInput {
  content: string;
  type: "traffic_update";
  requestsPerMinute: number;
}

export interface TripwireResult {
  event: EventDoc;
  decision: DecisionDoc | null;
  intervention: Intervention | null;
  usedVectorSearch: boolean;
  wasDuplicate: boolean;
}

function computeIdempotencyKey(tenantId: string, input: TripwireInput): string {
  const raw = `${tenantId}:${input.type}:${input.content}:${input.requestsPerMinute}`;
  return createHash("sha256").update(raw).digest("hex");
}

export async function processEvent(
  input: TripwireInput
): Promise<TripwireResult> {
  const tenantId = env.tenantId;
  const idempotencyKey = computeIdempotencyKey(tenantId, input);

  const existing = await findEventByIdempotencyKey(tenantId, idempotencyKey);
  if (existing) {
    const decision = await findCurrentDecision(tenantId);
    const intervention =
      decision?.interventions.find((i) => i.eventId.equals(existing._id)) ??
      null;
    return {
      event: existing,
      decision,
      intervention,
      usedVectorSearch: false,
      wasDuplicate: true,
    };
  }

  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    throw new Error("No active decision found. Reset the demo first.");
  }

  const embedding = await generateEmbedding(input.content);
  const retrieval = await retrieveCandidateAssumptions(
    tenantId,
    { type: input.type },
    embedding
  );

  const relevant = retrieval.assumptions.filter((a) =>
    decision.assumptionIds.some((id) => id.equals(a._id))
  );
  const candidates = relevant.length > 0 ? relevant : retrieval.assumptions;

  const eventId = new ObjectId();
  const baseEvent: EventDoc = {
    _id: eventId,
    tenantId,
    type: input.type,
    content: input.content,
    structuredData: { metric: "requests_per_minute", value: input.requestsPerMinute },
    embedding: embedding ?? [],
    candidateAssumptionIds: candidates.map((a) => a._id),
    classification: null,
    interventionTriggered: false,
    idempotencyKey,
    createdAt: new Date(),
  };

  if (candidates.length === 0) {
    const event = await insertEvent(baseEvent);
    return {
      event,
      decision,
      intervention: null,
      usedVectorSearch: retrieval.usedVectorSearch,
      wasDuplicate: false,
    };
  }

  const primaryAssumption = candidates[0];
  const classification = await classifyRelationship(
    baseEvent,
    primaryAssumption,
    decision
  );
  const policy = decidePolicy(baseEvent, primaryAssumption, classification);

  let intervention: Intervention | null = null;
  let updatedDecision: DecisionDoc | null = decision;

  await setAssumptionStatus(primaryAssumption._id, policy.assumptionNewStatus);

  if (policy.action === "pause") {
    intervention = {
      type: "assumption_invalidated",
      eventId,
      assumptionId: primaryAssumption._id,
      previousStatus: decision.status,
      newStatus: "paused",
      reason: policy.reason,
      createdAt: new Date(),
    };
    updatedDecision = await applyIntervention(decision._id, intervention, "paused");
  }

  const event = await insertEvent({
    ...baseEvent,
    classification,
    interventionTriggered: policy.action === "pause",
  });

  return {
    event,
    decision: updatedDecision,
    intervention,
    usedVectorSearch: retrieval.usedVectorSearch,
    wasDuplicate: false,
  };
}
