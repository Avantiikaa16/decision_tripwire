import { getDb } from "./mongodb";
import type { AssumptionDoc, EventDoc } from "./types";

export const ASSUMPTIONS_VECTOR_INDEX = "assumptions_vector_index";

export interface RetrievalResult {
  assumptions: AssumptionDoc[];
  usedVectorSearch: boolean;
}

// Maps an event type to the assumption category it can possibly affect.
// This is the P0 structured fallback: no embeddings required, always works.
const EVENT_TYPE_TO_CATEGORY: Record<string, string> = {
  traffic_update: "traffic",
};

async function structuredCandidateLookup(
  tenantId: string,
  event: Pick<EventDoc, "type">
): Promise<AssumptionDoc[]> {
  const db = await getDb();
  const category = EVENT_TYPE_TO_CATEGORY[event.type];
  const filter: Record<string, unknown> = { tenantId, status: "valid" };
  if (category) filter.category = category;
  return db
    .collection<AssumptionDoc>("assumptions")
    .find(filter)
    .limit(3)
    .toArray();
}

async function vectorSearchLookup(
  tenantId: string,
  embedding: number[]
): Promise<AssumptionDoc[] | null> {
  try {
    const db = await getDb();
    const results = await db
      .collection<AssumptionDoc>("assumptions")
      .aggregate<AssumptionDoc>([
        {
          $vectorSearch: {
            index: ASSUMPTIONS_VECTOR_INDEX,
            path: "embedding",
            queryVector: embedding,
            numCandidates: 50,
            limit: 3,
            filter: { tenantId, status: "valid" },
          },
        },
      ])
      .toArray();
    return results;
  } catch {
    // Index missing, cluster doesn't support $vectorSearch yet, etc.
    return null;
  }
}

/**
 * Retrieves assumptions that *may* be related to an incoming event.
 * This never decides contradiction -- see lib/classifier.ts and
 * lib/policy-engine.ts for that. Prefers real Atlas Vector Search when an
 * embedding and index are available; otherwise falls back to a structured
 * category match so the core demo works with zero external dependencies.
 */
export async function retrieveCandidateAssumptions(
  tenantId: string,
  event: Pick<EventDoc, "type">,
  embedding: number[] | null
): Promise<RetrievalResult> {
  if (embedding) {
    const vectorResults = await vectorSearchLookup(tenantId, embedding);
    if (vectorResults && vectorResults.length > 0) {
      return { assumptions: vectorResults, usedVectorSearch: true };
    }
  }
  const structured = await structuredCandidateLookup(tenantId, event);
  return { assumptions: structured, usedVectorSearch: false };
}
