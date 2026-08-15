import { env } from "./env";

export const EMBEDDING_DIMENSIONS = 4096;

/**
 * Prefers a dedicated EMBEDDING_API_KEY/EMBEDDING_MODEL if configured
 * (OpenAI-compatible /v1/embeddings), otherwise falls back to Fireworks
 * using the same key already used for classification -- Fireworks serves
 * embedding models under the same account, so no separate signup is
 * needed. Returns null (not a zero vector) when nothing is configured, so
 * callers can fall back to structured retrieval instead of silently
 * matching nothing.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (env.embeddingApiKey() && env.embeddingModel()) {
    const result = await callEmbeddingsEndpoint(
      "https://api.openai.com/v1/embeddings",
      env.embeddingApiKey(),
      env.embeddingModel(),
      text
    );
    if (result) return result;
  }

  if (env.fireworksApiKey()) {
    return callEmbeddingsEndpoint(
      "https://api.fireworks.ai/inference/v1/embeddings",
      env.fireworksApiKey(),
      "accounts/fireworks/models/qwen3-embedding-8b",
      text
    );
  }

  return null;
}

async function callEmbeddingsEndpoint(
  url: string,
  apiKey: string,
  model: string,
  text: string
): Promise<number[] | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return null;
    return embedding;
  } catch {
    return null;
  }
}
