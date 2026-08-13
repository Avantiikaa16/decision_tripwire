function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  mongodbUri: () => required("MONGODB_URI"),
  mongodbDb: () => process.env.MONGODB_DB || "decision_tripwire",
  openrouterApiKey: () => process.env.OPENROUTER_API_KEY || "",
  openrouterModel: () =>
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
  fireworksApiKey: () => process.env.FIREWORKS_API_KEY || "",
  fireworksModel: () =>
    process.env.FIREWORKS_MODEL || "accounts/fireworks/models/llama-v3p1-8b-instruct",
  embeddingApiKey: () => process.env.EMBEDDING_API_KEY || "",
  embeddingModel: () => process.env.EMBEDDING_MODEL || "",
  tenantId: "demo-company" as const,
};
