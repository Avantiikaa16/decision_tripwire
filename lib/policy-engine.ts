import type { AssumptionDoc, AssumptionStatus, Classification, EventDoc } from "./types";

export type PolicyAction = "pause" | "challenge" | "none";

export interface PolicyDecision {
  action: PolicyAction;
  assumptionNewStatus: AssumptionStatus;
  reason: string;
}

const CONTRADICTION_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Owns the final intervention decision. Vector search only retrieves
 * candidates and the LLM only classifies the relationship -- neither is
 * trusted to trigger a pause on its own. The numeric threshold check is
 * evaluated first and independently of the model, so the demo's outcome
 * never depends on model availability or correctness.
 */
export function decidePolicy(
  event: Pick<EventDoc, "structuredData">,
  assumption: Pick<AssumptionDoc, "structuredCondition">,
  classification: Classification
): PolicyDecision {
  const { value } = event.structuredData;
  const { threshold } = assumption.structuredCondition;

  if (value > threshold) {
    return {
      action: "pause",
      assumptionNewStatus: "invalidated",
      reason: `Traffic reached ${value} RPM, violating the assumption that traffic would remain below ${threshold} RPM.`,
    };
  }

  if (
    classification.relationship === "contradicts" &&
    classification.confidence >= CONTRADICTION_CONFIDENCE_THRESHOLD
  ) {
    return {
      action: "pause",
      assumptionNewStatus: "invalidated",
      reason: classification.reason,
    };
  }

  if (classification.relationship === "uncertain") {
    return {
      action: "challenge",
      assumptionNewStatus: "challenged",
      reason: classification.reason,
    };
  }

  return {
    action: "none",
    assumptionNewStatus: "valid",
    reason: classification.reason,
  };
}
