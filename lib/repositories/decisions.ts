import { ObjectId, type Collection } from "mongodb";
import { getDb } from "../mongodb";
import type { DecisionDoc, DecisionStatus, Intervention } from "../types";

async function collection(): Promise<Collection<DecisionDoc>> {
  const db = await getDb();
  return db.collection<DecisionDoc>("decisions");
}

export async function insertDecision(
  doc: Omit<DecisionDoc, "_id">
): Promise<DecisionDoc> {
  const col = await collection();
  const _id = new ObjectId();
  const full: DecisionDoc = { _id, ...doc };
  await col.insertOne(full);
  return full;
}

export async function findCurrentDecision(
  tenantId: string
): Promise<DecisionDoc | null> {
  const col = await collection();
  return col.findOne({ tenantId }, { sort: { createdAt: -1 } });
}

export async function findDecisionById(
  id: ObjectId
): Promise<DecisionDoc | null> {
  const col = await collection();
  return col.findOne({ _id: id });
}

export async function setDecisionStatus(
  id: ObjectId,
  status: DecisionStatus
): Promise<DecisionDoc | null> {
  const col = await collection();
  return col.findOneAndUpdate(
    { _id: id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

/**
 * Starts the canary rollout: ready -> canary_deploying at the given
 * percentage. Only applies if the decision is currently "ready" -- a
 * canary that's already running, blocked, or rolled back can't be
 * (re)started this way.
 */
export async function startCanary(
  id: ObjectId,
  percentage: number
): Promise<DecisionDoc | null> {
  const col = await collection();
  return col.findOneAndUpdate(
    { _id: id, status: "ready" },
    {
      $set: {
        status: "canary_deploying",
        canaryPercentage: percentage,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
}

/**
 * Applies an intervention atomically: records the reason, flips status,
 * updates canary exposure if a rollback occurred, and bumps revision -- all
 * in one update so the decision's history is self-contained and consistent.
 */
export async function applyIntervention(
  id: ObjectId,
  intervention: Intervention,
  updates: {
    newStatus: DecisionStatus;
    canaryPercentage?: number;
    previousCanaryPercentage?: number;
    rollbackCompleted?: boolean;
  }
): Promise<DecisionDoc | null> {
  const col = await collection();
  const setFields: Record<string, unknown> = {
    status: updates.newStatus,
    updatedAt: new Date(),
  };
  if (updates.canaryPercentage !== undefined) {
    setFields.canaryPercentage = updates.canaryPercentage;
  }
  if (updates.previousCanaryPercentage !== undefined) {
    setFields.previousCanaryPercentage = updates.previousCanaryPercentage;
  }
  if (updates.rollbackCompleted !== undefined) {
    setFields.rollbackCompleted = updates.rollbackCompleted;
  }

  return col.findOneAndUpdate(
    { _id: id },
    {
      $set: setFields,
      $inc: { revision: 1 },
      $push: { interventions: intervention },
    },
    { returnDocument: "after" }
  );
}

export async function deleteDecisionsByTenant(
  tenantId: string
): Promise<void> {
  const col = await collection();
  await col.deleteMany({ tenantId });
}
