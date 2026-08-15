import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision, startCanary } from "@/lib/repositories/decisions";

const CANARY_PERCENTAGE = 5;

export async function POST() {
  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ error: "No active decision" }, { status: 404 });
  }
  if (decision.status !== "ready") {
    return NextResponse.json({ decision });
  }
  const updated = await startCanary(decision._id, CANARY_PERCENTAGE);
  return NextResponse.json({ decision: updated });
}
