import type { ObjectId } from "mongodb";

export type DecisionStatus =
  | "ready"
  | "deploying"
  | "paused"
  | "completed"
  | "cancelled";

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

export interface Intervention {
  type: "assumption_invalidated";
  eventId: ObjectId;
  assumptionId: ObjectId;
  previousStatus: DecisionStatus;
  newStatus: DecisionStatus;
  reason: string;
  createdAt: Date;
}

export interface DecisionDoc {
  _id: ObjectId;
  tenantId: string;
  type: "software_deployment";
  title: string;
  version: string;
  status: DecisionStatus;
  progress: number;
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

export interface EventDoc {
  _id: ObjectId;
  tenantId: string;
  type: "traffic_update";
  content: string;
  structuredData: {
    metric: "requests_per_minute";
    value: number;
  };
  embedding: number[];
  candidateAssumptionIds: ObjectId[];
  classification: Classification | null;
  interventionTriggered: boolean;
  idempotencyKey: string;
  createdAt: Date;
}
