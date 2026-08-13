import { ObjectId, type Collection } from "mongodb";
import { getDb } from "../mongodb";
import type { AssumptionDoc, AssumptionStatus } from "../types";

async function collection(): Promise<Collection<AssumptionDoc>> {
  const db = await getDb();
  return db.collection<AssumptionDoc>("assumptions");
}

export async function insertAssumption(
  doc: Omit<AssumptionDoc, "_id">
): Promise<AssumptionDoc> {
  const col = await collection();
  const _id = new ObjectId();
  const full: AssumptionDoc = { _id, ...doc };
  await col.insertOne(full);
  return full;
}

export async function findAssumptionsByIds(
  ids: ObjectId[]
): Promise<AssumptionDoc[]> {
  if (ids.length === 0) return [];
  const col = await collection();
  return col.find({ _id: { $in: ids } }).toArray();
}

export async function findAssumptionsByTenant(
  tenantId: string,
  status?: AssumptionStatus
): Promise<AssumptionDoc[]> {
  const col = await collection();
  const filter: Record<string, unknown> = { tenantId };
  if (status) filter.status = status;
  return col.find(filter).toArray();
}

export async function setAssumptionStatus(
  id: ObjectId,
  status: AssumptionStatus
): Promise<AssumptionDoc | null> {
  const col = await collection();
  return col.findOneAndUpdate(
    { _id: id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

export async function deleteAssumptionsByTenant(
  tenantId: string
): Promise<void> {
  const col = await collection();
  await col.deleteMany({ tenantId });
}
