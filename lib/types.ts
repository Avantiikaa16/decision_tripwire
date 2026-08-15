import type { ObjectId } from "mongodb";

// Only "ready", "canary_deploying", "blocked_pending_review", and
// "critical_incident" are ever persisted as a decision's resting status in
// this implementation -- the pipeline is a single automated request, so
// "assumption_invalidated" / "rolling_back" / "rolled_back" are conceptual
// transition steps (narrated in the intervention record and animated in the
// UI) rather than states anyone could observe mid-transition. They're kept
// in the type for documentation and to match the specified state machine.
export type DecisionStatus =
  | "ready"
  | "canary_deploying"
  | "assumption_invalidated"
  | "rolling_back"
  | "rolled_back"
  | "blocked_pending_review"
  | "critical_incident";

export type AssumptionStatus =
  | "valid"
  | "challenged"
  | "invalidated"
  | "superseded";

export type ClassificationRelationship =
  | "supports"
  | "contradicts"
  | "irrelevant"
  | "uncertain";

interface InterventionBase {
  eventId: ObjectId;
  assumptionId: ObjectId;
  previousStatus: DecisionStatus;
  newStatus: DecisionStatus;
  reason: string;
  createdAt: Date;
}

/** v2 never received any traffic exposure, so there's nothing to roll back -- just block it. */
export interface CandidateBlockedIntervention extends InterventionBase {
  type: "candidate_blocked";
}

/** The canary was live; stop further rollout and return all traffic to the production version. */
export interface CanaryRollbackIntervention extends InterventionBase {
  type: "canary_rollback";
  fromVersion: string;
  toVersion: string;
}

/** The candidate was already fully rolled out -- pausing/rolling back isn't a safe fiction; escalate instead. */
export interface CriticalIncidentIntervention extends InterventionBase {
  type: "critical_incident_escalation";
}

export type Intervention =
  | CandidateBlockedIntervention
  | CanaryRollbackIntervention
  | CriticalIncidentIntervention;

export interface DecisionDoc {
  _id: ObjectId;
  tenantId: string;
  type: "software_deployment";
  title: string;
  productionVersion: string;
  candidateVersion: string;
  status: DecisionStatus;
  canaryPercentage: number;
  previousCanaryPercentage: number;
  rollbackCompleted: boolean;
  assumptionIds: ObjectId[];
  revision: number;
  interventions: Intervention[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StructuredCondition {
  metric: "requests_per_minute";
  operator: "less_than";
  threshold: number;
}

export interface AssumptionDoc {
  _id: ObjectId;
  tenantId: string;
  decisionId: ObjectId;
  category: string;
  content: string;
  structuredCondition: StructuredCondition;
  status: AssumptionStatus;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Classification {
  relationship: ClassificationRelationship;
  confidence: number;
  reason: string;
  classifiedBy: string;
}

export type EventType = "traffic_update" | "operational_evidence";

/**
 * Only "traffic_update" carries a metric that's directly comparable to an
 * assumption's structuredCondition (both "requests_per_minute"), so only it
 * can trigger the deterministic numeric rule. "operational_evidence" events
 * are natural language with no comparable numeric field by design -- they
 * can only be acted on via retrieval + LLM reasoning, which is the point:
 * this is the event type that actually demonstrates the "connects new
 * natural-language evidence to assumptions" capability, not a threshold check.
 */
export interface EventStructuredData {
  metric: string;
  value: number;
}

export interface EventDoc {
  _id: ObjectId;
  tenantId: string;
  type: EventType;
  content: string;
  structuredData: EventStructuredData | null;
  embedding: number[];
  candidateAssumptionIds: ObjectId[];
  classification: Classification | null;
  interventionTriggered: boolean;
  idempotencyKey: string;
  createdAt: Date;
}
