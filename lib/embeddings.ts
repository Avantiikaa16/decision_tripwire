import { env } from "./env";

export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Returns null (not a zero vector) when no embedding provider is configured,
 * so callers can tell "not configured" apart from "computed a real vector"
 * and fall back to structured retrieval instead of silently matching nothing.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = env.embeddingApiKey();
  const model = env.embeddingModel();
  if (!apiKey || !model) {
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
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
