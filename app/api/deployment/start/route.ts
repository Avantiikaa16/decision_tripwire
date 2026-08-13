import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision, setDecisionStatus } from "@/lib/repositories/decisions";

export async function POST() {
  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ error: "No active decision" }, { status: 404 });
  }
  if (decision.status !== "ready") {
    return NextResponse.json({ decision });
  }
  const updated = await setDecisionStatus(decision._id, "deploying");
  return NextResponse.json({ decision: updated });
}
