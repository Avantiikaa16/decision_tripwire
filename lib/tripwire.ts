import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { env } from "./env";
import { generateEmbedding } from "./embeddings";
import { retrieveCandidateAssumptions } from "./vector-search";
import { classifyRelationship } from "./classifier";
import { decidePolicy } from "./policy-engine";
import { findCurrentDecision, applyIntervention } from "./repositories/decisions";
import { setAssumptionStatus, findAssumptionsByIds } from "./repositories/assumptions";
import { findEventByIdempotencyKey, insertEvent } from "./repositories/events";
import type {
  AssumptionDoc,
  DecisionDoc,
  EventDoc,
  EventStructuredData,
  EventType,
  Intervention,
} from "./types";

export interface TripwireInput {
  content: string;
  type: EventType;
  structuredData: EventStructuredData | null;
}

export interface TripwireResult {
  event: EventDoc;
  decision: DecisionDoc | null;
  assumptions: AssumptionDoc[];
  intervention: Intervention | null;
  usedVectorSearch: boolean;
  wasDuplicate: boolean;
}

function computeIdempotencyKey(tenantId: string, input: TripwireInput): string {
  const raw = `${tenantId}:${input.type}:${input.content}:${input.structuredData?.value ?? ""}`;
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
    const assumptions = decision
      ? await findAssumptionsByIds(decision.assumptionIds)
      : [];
    return {
      event: existing,
      decision,
      assumptions,
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
    structuredData: input.structuredData,
    embedding: embedding ?? [],
    candidateAssumptionIds: candidates.map((a) => a._id),
    classification: null,
    interventionTriggered: false,
    idempotencyKey,
    createdAt: new Date(),
  };

  if (candidates.length === 0) {
    const event = await insertEvent(baseEvent);
    const assumptions = await findAssumptionsByIds(decision.assumptionIds);
    return {
      event,
      decision,
      assumptions,
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
  const policy = decidePolicy(decision, baseEvent, primaryAssumption, classification);

  let intervention: Intervention | null = null;
  let updatedDecision: DecisionDoc | null = decision;

  await setAssumptionStatus(primaryAssumption._id, policy.assumptionNewStatus);

  if (policy.action === "block") {
    intervention = {
      type: "candidate_blocked",
      eventId,
      assumptionId: primaryAssumption._id,
      previousStatus: decision.status,
      newStatus: "blocked_pending_review",
      reason: policy.reason,
      createdAt: new Date(),
    };
    updatedDecision = await applyIntervention(decision._id, intervention, {
      newStatus: "blocked_pending_review",
    });
  } else if (policy.action === "rollback") {
    intervention = {
      type: "canary_rollback",
      eventId,
      assumptionId: primaryAssumption._id,
      previousStatus: decision.status,
      newStatus: "blocked_pending_review",
      reason: policy.reason,
      fromVersion: decision.candidateVersion,
      toVersion: decision.productionVersion,
      createdAt: new Date(),
    };
    updatedDecision = await applyIntervention(decision._id, intervention, {
      newStatus: "blocked_pending_review",
      canaryPercentage: 0,
      previousCanaryPercentage: decision.canaryPercentage,
      rollbackCompleted: true,
    });
  } else if (policy.action === "escalate") {
    intervention = {
      type: "critical_incident_escalation",
      eventId,
      assumptionId: primaryAssumption._id,
      previousStatus: decision.status,
      newStatus: "critical_incident",
      reason: policy.reason,
      createdAt: new Date(),
    };
    updatedDecision = await applyIntervention(decision._id, intervention, {
      newStatus: "critical_incident",
    });
  }

  const event = await insertEvent({
    ...baseEvent,
    classification,
    interventionTriggered: intervention !== null,
  });

  const assumptions = await findAssumptionsByIds(decision.assumptionIds);

  return {
    event,
    decision: updatedDecision,
    assumptions,
    intervention,
    usedVectorSearch: retrieval.usedVectorSearch,
    wasDuplicate: false,
  };
}
