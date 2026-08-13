import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision } from "@/lib/repositories/decisions";
import { findAssumptionsByIds } from "@/lib/repositories/assumptions";

/**
 * Read-only: proves persistence by reloading state straight from MongoDB,
 * never from anything cached client-side. Never writes.
 */
export async function POST() {
  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ decision: null, assumptions: [] });
  }
  const assumptions = await findAssumptionsByIds(decision.assumptionIds);
  return NextResponse.json({ decision, assumptions });
}
