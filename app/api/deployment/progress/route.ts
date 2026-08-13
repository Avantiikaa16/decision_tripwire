import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision, incrementProgress } from "@/lib/repositories/decisions";

const PROGRESS_STEP = 8;

export async function POST() {
  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ error: "No active decision" }, { status: 404 });
  }
  const updated = await incrementProgress(decision._id, PROGRESS_STEP);
  return NextResponse.json({ decision: updated });
}
