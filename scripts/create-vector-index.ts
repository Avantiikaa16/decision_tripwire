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

  const definition = {
    fields: [
      {
        type: "vector" as const,
        path: "embedding",
        numDimensions: EMBEDDING_DIMENSIONS,
        similarity: "cosine" as const,
      },
      { type: "filter" as const, path: "tenantId" },
      { type: "filter" as const, path: "status" },
    ],
  };

  const existing = await collection.listSearchIndexes().toArray();
  const current = existing.find((i) => i.name === ASSUMPTIONS_VECTOR_INDEX);

  if (current) {
    const currentDims = (
      current as unknown as {
        latestDefinition?: { fields?: { numDimensions?: number }[] };
      }
    ).latestDefinition?.fields?.[0]?.numDimensions;
    if (currentDims === EMBEDDING_DIMENSIONS) {
      console.log(
        `Index "${ASSUMPTIONS_VECTOR_INDEX}" already exists at ${EMBEDDING_DIMENSIONS} dimensions. Skipping.`
      );
      return;
    }
    console.log(
      `Index "${ASSUMPTIONS_VECTOR_INDEX}" exists at ${currentDims} dimensions, updating to ${EMBEDDING_DIMENSIONS}...`
    );
    await collection.updateSearchIndex(ASSUMPTIONS_VECTOR_INDEX, definition);
    console.log("Update requested. It can take a minute to rebuild.");
    return;
  }

  await collection.createSearchIndex({
    name: ASSUMPTIONS_VECTOR_INDEX,
    type: "vectorSearch",
    definition,
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
