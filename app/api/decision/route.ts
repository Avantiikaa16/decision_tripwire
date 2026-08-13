import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision } from "@/lib/repositories/decisions";
import { findAssumptionsByIds } from "@/lib/repositories/assumptions";
import { findRecentEvents } from "@/lib/repositories/events";

export async function GET() {
  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ decision: null, assumptions: [], events: [] });
  }
  const [assumptions, events] = await Promise.all([
    findAssumptionsByIds(decision.assumptionIds),
    findRecentEvents(tenantId, 10),
  ]);
  return NextResponse.json({ decision, assumptions, events });
}
