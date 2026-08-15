// Client-side mirrors of the server documents after JSON serialization
// (ObjectId -> string, Date -> ISO string).

export type DecisionStatus =
  | "ready"
  | "canary_deploying"
  | "assumption_invalidated"
  | "rolling_back"
  | "rolled_back"
  | "blocked_pending_review"
  | "critical_incident";

export type AssumptionStatus = "valid" | "challenged" | "invalidated" | "superseded";

export type InterventionType =
  | "candidate_blocked"
  | "canary_rollback"
  | "critical_incident_escalation";

export interface ClientIntervention {
  type: InterventionType;
  eventId: string;
  assumptionId: string;
  previousStatus: DecisionStatus;
  newStatus: DecisionStatus;
  reason: string;
  fromVersion?: string;
  toVersion?: string;
  createdAt: string;
}

export interface ClientDecision {
  _id: string;
  title: string;
  productionVersion: string;
  candidateVersion: string;
  status: DecisionStatus;
  canaryPercentage: number;
  previousCanaryPercentage: number;
  rollbackCompleted: boolean;
  assumptionIds: string[];
  revision: number;
  interventions: ClientIntervention[];
}

export interface ClientAssumption {
  _id: string;
  category: string;
  content: string;
  structuredCondition: { metric: string; operator: string; threshold: number };
  status: AssumptionStatus;
}

export interface ClientClassification {
  relationship: "supports" | "contradicts" | "irrelevant" | "uncertain";
  confidence: number;
  reason: string;
  classifiedBy: string;
}

export interface ClientEventResult {
  event: {
    _id: string;
    content: string;
    structuredData: { metric: string; value: number } | null;
    classification: ClientClassification | null;
    interventionTriggered: boolean;
  };
  decision: ClientDecision | null;
  assumptions: ClientAssumption[];
  intervention: ClientIntervention | null;
  usedVectorSearch: boolean;
  wasDuplicate: boolean;
}
