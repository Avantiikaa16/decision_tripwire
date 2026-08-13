import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { findCurrentDecision, setDecisionStatus } from "@/lib/repositories/decisions";

/**
 * MVP re-evaluation: a human can cancel a paused deployment. It never
 * auto-resumes -- that would require a new valid assumption to be stored,
 * which is out of scope for this demo.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "cancel") {
    return NextResponse.json(
      { error: "Unsupported action. Only 'cancel' is allowed for the MVP." },
      { status: 400 }
    );
  }

  const tenantId = env.tenantId;
  const decision = await findCurrentDecision(tenantId);
  if (!decision) {
    return NextResponse.json({ error: "No active decision" }, { status: 404 });
  }
  if (decision.status !== "paused") {
    return NextResponse.json(
      { error: "Only a paused deployment can be cancelled" },
      { status: 409 }
    );
  }
  const updated = await setDecisionStatus(decision._id, "cancelled");
  return NextResponse.json({ decision: updated });
}
