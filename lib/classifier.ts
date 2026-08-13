import { env } from "./env";
import type {
  AssumptionDoc,
  Classification,
  ClassificationRelationship,
  DecisionDoc,
  EventDoc,
} from "./types";

const ALLOWED_RELATIONSHIPS: ClassificationRelationship[] = [
  "supports",
  "contradicts",
  "irrelevant",
  "uncertain",
];

const SYSTEM_PROMPT =
  "Determine whether the operational event supports, contradicts, is irrelevant to, " +
  "or leaves uncertainty about the assumption. Return only valid JSON of the shape " +
  '{"relationship": "supports | contradicts | irrelevant | uncertain", "confidence": 0.0, "reason": "Short explanation"}. ' +
  "Do not decide whether to execute or pause the deployment.";

/**
 * The deterministic numeric rule doubles as the fallback classification, so
 * "the model is down" and "the model was never configured" behave
 * identically -- the demo outcome never depends on the LLM being reachable.
 */
function deterministicClassification(
  event: Pick<EventDoc, "structuredData">,
  assumption: Pick<AssumptionDoc, "structuredCondition">
): Classification {
  const { value } = event.structuredData;
  const { threshold } = assumption.structuredCondition;
  if (value > threshold) {
    return {
      relationship: "contradicts",
      confidence: 1,
      reason: `Deterministic rule: observed ${value} req/min exceeds the safe threshold of ${threshold} req/min.`,
      classifiedBy: "deterministic-fallback",
    };
  }
  return {
    relationship: "supports",
    confidence: 1,
    reason: `Deterministic rule: observed ${value} req/min is within the safe threshold of ${threshold} req/min.`,
    classifiedBy: "deterministic-fallback",
  };
}

function isValidClassification(value: unknown): value is Classification {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.relationship === "string" &&
    ALLOWED_RELATIONSHIPS.includes(v.relationship as ClassificationRelationship) &&
    typeof v.confidence === "number" &&
    v.confidence >= 0 &&
    v.confidence <= 1 &&
    typeof v.reason === "string"
  );
}

async function callChatCompletion(
  url: string,
  apiKey: string,
  model: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

export async function classifyRelationship(
  event: EventDoc,
  assumption: AssumptionDoc,
  decision: DecisionDoc
): Promise<Classification> {
  const userPrompt = JSON.stringify({
    event: { type: event.type, content: event.content, structuredData: event.structuredData },
    assumption: { content: assumption.content, structuredCondition: assumption.structuredCondition },
    decision: { title: decision.title, version: decision.version },
  });

  let raw: string | null = null;
  let classifiedBy = "";

  if (env.openrouterApiKey()) {
    raw = await callChatCompletion(
      "https://openrouter.ai/api/v1/chat/completions",
      env.openrouterApiKey(),
      env.openrouterModel(),
      userPrompt
    );
    classifiedBy = "openrouter";
  } else if (env.fireworksApiKey()) {
    raw = await callChatCompletion(
      "https://api.fireworks.ai/inference/v1/chat/completions",
      env.fireworksApiKey(),
      env.fireworksModel(),
      userPrompt
    );
    classifiedBy = "fireworks";
  }

  if (!raw) {
    return deterministicClassification(event, assumption);
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isValidClassification(parsed)) {
      return deterministicClassification(event, assumption);
    }
    return { ...parsed, classifiedBy };
  } catch {
    return deterministicClassification(event, assumption);
  }
}
