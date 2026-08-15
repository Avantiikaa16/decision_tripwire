import type {
  AssumptionDoc,
  AssumptionStatus,
  Classification,
  DecisionDoc,
  EventDoc,
} from "./types";

export type PolicyAction = "block" | "rollback" | "escalate" | "challenge" | "none";

export interface PolicyDecision {
  action: PolicyAction;
  assumptionNewStatus: AssumptionStatus;
  reason: string;
}

const CONTRADICTION_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Only fires when the event's metric is directly comparable to the
 * assumption's (both "requests_per_minute", from a traffic_update event).
 * Natural-language "operational_evidence" events have no comparable field
 * by design, so they can only be judged via the model classification below.
 */
function numericContradiction(
  event: Pick<EventDoc, "structuredData">,
  assumption: Pick<AssumptionDoc, "structuredCondition">
): boolean {
  if (!event.structuredData) return false;
  if (event.structuredData.metric !== assumption.structuredCondition.metric) {
    return false;
  }
  return event.structuredData.value > assumption.structuredCondition.threshold;
}

/**
 * Owns the final intervention decision, in two independent steps:
 * (1) is the assumption actually contradicted -- numeric rule first and
 *     independently of the model, so the outcome never depends on model
 *     availability or correctness; classification only decides it when
 *     there's no comparable numeric field to check.
 * (2) given that it's contradicted, what's the *safe* intervention for the
 *     decision's current rollout state -- a candidate that never received
 *     traffic just gets blocked, a live canary gets rolled back, and a
 *     fully-rolled-out candidate can't be safely "paused" so it escalates
 *     to a different recovery workflow instead of pretending to roll back.
 */
export function decidePolicy(
  decision: Pick<DecisionDoc, "status" | "canaryPercentage">,
  event: Pick<EventDoc, "structuredData">,
  assumption: Pick<AssumptionDoc, "structuredCondition">,
  classification: Classification
): PolicyDecision {
  const numeric = numericContradiction(event, assumption);
  const modelContradicts =
    classification.relationship === "contradicts" &&
    classification.confidence >= CONTRADICTION_CONFIDENCE_THRESHOLD;

  if (numeric || modelContradicts) {
    const reason = numeric
      ? `Observed ${event.structuredData!.value} ${event.structuredData!.metric.replace(/_/g, " ")} exceeds the safe threshold of ${assumption.structuredCondition.threshold} ${assumption.structuredCondition.metric.replace(/_/g, " ")}.`
      : classification.reason;

    if (decision.canaryPercentage >= 100) {
      return { action: "escalate", assumptionNewStatus: "invalidated", reason };
    }
    if (decision.status === "canary_deploying" && decision.canaryPercentage > 0) {
      return { action: "rollback", assumptionNewStatus: "invalidated", reason };
    }
    return { action: "block", assumptionNewStatus: "invalidated", reason };
  }

  if (classification.relationship === "uncertain") {
    return {
      action: "challenge",
      assumptionNewStatus: "challenged",
      reason: classification.reason,
    };
  }

  return { action: "none", assumptionNewStatus: "valid", reason: classification.reason };
}
