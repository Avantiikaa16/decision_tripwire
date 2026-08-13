/**
 * Creates the Atlas Vector Search index over assumptions.embedding.
 * Requires an M10+ dedicated cluster (the hackathon sandbox qualifies) --
 * $vectorSearch is not available on shared/free tiers.
 *
 * Run with: npx tsx scripts/create-vector-index.ts
 */
import "dotenv/config";
import { getDb } from "../lib/mongodb";
import { ASSUMPTIONS_VECTOR_INDEX } from "../lib/vector-search";
import { EMBEDDING_DIMENSIONS } from "../lib/embeddings";

async function main() {
  const db = await getDb();
  const collection = db.collection("assumptions");

  const existing = await collection.listSearchIndexes().toArray();
  if (existing.some((i) => i.name === ASSUMPTIONS_VECTOR_INDEX)) {
    console.log(`Index "${ASSUMPTIONS_VECTOR_INDEX}" already exists. Skipping.`);
    return;
  }

  await collection.createSearchIndex({
    name: ASSUMPTIONS_VECTOR_INDEX,
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: EMBEDDING_DIMENSIONS,
          similarity: "cosine",
        },
        { type: "filter", path: "tenantId" },
        { type: "filter", path: "status" },
      ],
    },
  });

  console.log(
    `Requested creation of "${ASSUMPTIONS_VECTOR_INDEX}". It can take a minute to become queryable; ` +
      "lib/vector-search.ts falls back to structured retrieval until it is."
  );
}

main()
  .catch((err) => {
    console.error("Failed to create vector index:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
