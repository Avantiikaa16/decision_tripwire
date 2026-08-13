import { type Collection } from "mongodb";
import { getDb } from "../mongodb";
import type { EventDoc } from "../types";
import { ObjectId } from "mongodb";

async function collection(): Promise<Collection<EventDoc>> {
  const db = await getDb();
  return db.collection<EventDoc>("events");
}

export async function findEventByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string
): Promise<EventDoc | null> {
  const col = await collection();
  return col.findOne({ tenantId, idempotencyKey });
}

export async function insertEvent(doc: EventDoc): Promise<EventDoc> {
  const col = await collection();
  await col.insertOne(doc);
  return doc;
}

export async function updateEventOutcome(
  id: ObjectId,
  update: Pick<
    EventDoc,
    "candidateAssumptionIds" | "classification" | "interventionTriggered"
  >
): Promise<void> {
  const col = await collection();
  await col.updateOne({ _id: id }, { $set: update });
}

export async function findRecentEvents(
  tenantId: string,
  limit = 10
): Promise<EventDoc[]> {
  const col = await collection();
  return col
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function deleteEventsByTenant(tenantId: string): Promise<void> {
  const col = await collection();
  await col.deleteMany({ tenantId });
}
