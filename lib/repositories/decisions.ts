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
  const result = await col.findOneAndUpdate(
    { _id: id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}

/**
 * Only advances progress while the decision is actively deploying, so a
 * paused/completed/cancelled deployment can never silently keep moving.
 */
export async function incrementProgress(
  id: ObjectId,
  amount: number
): Promise<DecisionDoc | null> {
  const col = await collection();
  const current = await col.findOne({ _id: id });
  if (!current || current.status !== "deploying") {
    return current;
  }
  const nextProgress = Math.min(100, current.progress + amount);
  const status: DecisionStatus =
    nextProgress >= 100 ? "completed" : "deploying";
  const result = await col.findOneAndUpdate(
    { _id: id, status: "deploying" },
    { $set: { progress: nextProgress, status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result;
}

/**
 * Applies an intervention atomically: records the reason, flips status, and
 * bumps revision in one update so the decision's history is self-contained.
 */
export async function applyIntervention(
  id: ObjectId,
  intervention: Intervention,
  newStatus: DecisionStatus
): Promise<DecisionDoc | null> {
  const col = await collection();
  const result = await col.findOneAndUpdate(
    { _id: id },
    {
      $set: { status: newStatus, updatedAt: new Date() },
      $inc: { revision: 1 },
      $push: { interventions: intervention },
    },
    { returnDocument: "after" }
  );
  return result;
}

export async function deleteDecisionsByTenant(
  tenantId: string
): Promise<void> {
  const col = await collection();
  await col.deleteMany({ tenantId });
}
