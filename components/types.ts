// Client-side mirrors of the server documents after JSON serialization
// (ObjectId -> string, Date -> ISO string).

export type DecisionStatus =
  | "ready"
  | "deploying"
  | "paused"
  | "completed"
  | "cancelled";

export type AssumptionStatus = "valid" | "challenged" | "invalidated" | "superseded";

export interface ClientIntervention {
  type: "assumption_invalidated";
  eventId: string;
  assumptionId: string;
  previousStatus: DecisionStatus;
  newStatus: DecisionStatus;
  reason: string;
  createdAt: string;
}

export interface ClientDecision {
  _id: string;
  title: string;
  version: string;
  status: DecisionStatus;
  progress: number;
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
    classification: ClientClassification | null;
    interventionTriggered: boolean;
  };
  decision: ClientDecision | null;
  intervention: ClientIntervention | null;
  usedVectorSearch: boolean;
  wasDuplicate: boolean;
}
