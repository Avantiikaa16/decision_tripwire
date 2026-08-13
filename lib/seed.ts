import { env } from "./env";
import { getDb } from "./mongodb";
import { generateEmbedding } from "./embeddings";
import { insertDecision, deleteDecisionsByTenant } from "./repositories/decisions";
import { insertAssumption, deleteAssumptionsByTenant } from "./repositories/assumptions";
import { deleteEventsByTenant } from "./repositories/events";
import type { DecisionDoc, AssumptionDoc } from "./types";

export interface SeedResult {
  decision: DecisionDoc;
  assumption: AssumptionDoc;
}

const TRAFFIC_ASSUMPTION_CONTENT =
  "Traffic must remain below 1,000 requests per minute.";

/**
 * Deletes only this demo's tenant records (never a blanket collection wipe)
 * and reseeds the single deployment decision + supporting assumption that
 * the whole demo script depends on.
 */
export async function resetAndSeedDemo(): Promise<SeedResult> {
  const tenantId = env.tenantId;

  await Promise.all([
    deleteDecisionsByTenant(tenantId),
    deleteAssumptionsByTenant(tenantId),
    deleteEventsByTenant(tenantId),
  ]);

  const now = new Date();
  const decision = await insertDecision({
    tenantId,
    type: "software_deployment",
    title: "Deploy version 2",
    version: "2.0.0",
    status: "ready",
    progress: 0,
    assumptionIds: [],
    revision: 1,
    interventions: [],
    createdAt: now,
    updatedAt: now,
  });

  const embedding = await generateEmbedding(TRAFFIC_ASSUMPTION_CONTENT);
  const assumption = await insertAssumption({
    tenantId,
    decisionId: decision._id,
    category: "traffic",
    content: TRAFFIC_ASSUMPTION_CONTENT,
    structuredCondition: {
      metric: "requests_per_minute",
      operator: "less_than",
      threshold: 1000,
    },
    status: "valid",
    embedding: embedding ?? [],
    createdAt: now,
    updatedAt: now,
  });

  const db = await getDb();
  await db
    .collection("decisions")
    .updateOne({ _id: decision._id }, { $set: { assumptionIds: [assumption._id] } });
  decision.assumptionIds = [assumption._id];

  return { decision, assumption };
}
