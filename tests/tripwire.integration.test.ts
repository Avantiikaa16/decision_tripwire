import { beforeEach, describe, expect, it } from "vitest";
import { resetAndSeedDemo } from "../lib/seed";
import { processEvent } from "../lib/tripwire";
import { findCurrentDecision, startCanary } from "../lib/repositories/decisions";
import { getDb } from "../lib/mongodb";

// Integration tests run against the real Atlas Hackathon Sandbox cluster
// (same MONGODB_URI as the app), scoped to tenantId "demo-company" only.

const MARKETING_EVIDENCE = {
  content: "Marketing moved the product launch to now. Approximately 50,000 users are expected.",
  type: "operational_evidence" as const,
  structuredData: { metric: "expected_users", value: 50000 },
};

const TRAFFIC_SPIKE = {
  content: "Traffic has increased to 3,500 requests per minute.",
  type: "traffic_update" as const,
  structuredData: { metric: "requests_per_minute", value: 3500 },
};

const TRAFFIC_WITHIN_THRESHOLD = {
  content: "Traffic is steady at 400 requests per minute.",
  type: "traffic_update" as const,
  structuredData: { metric: "requests_per_minute", value: 400 },
};

describe("tripwire integration (live Atlas sandbox)", () => {
  beforeEach(async () => {
    await resetAndSeedDemo();
  });

  it("moves a decision from ready to canary_deploying", async () => {
    const decision = await findCurrentDecision("demo-company");
    expect(decision?.status).toBe("ready");
    const updated = await startCanary(decision!._id, 5);
    expect(updated?.status).toBe("canary_deploying");
    expect(updated?.canaryPercentage).toBe(5);
  });

  it("does not restart a canary that's already running", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);
    const second = await startCanary(decision!._id, 5);
    expect(second).toBeNull();
  });

  it("contradicting natural-language evidence rolls back the canary and blocks the candidate", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);

    const result = await processEvent(MARKETING_EVIDENCE);

    expect(result.intervention?.type).toBe("canary_rollback");
    expect(result.decision?.status).toBe("blocked_pending_review");
    expect(result.decision?.canaryPercentage).toBe(0);
    expect(result.decision?.rollbackCompleted).toBe(true);
    expect(result.event.interventionTriggered).toBe(true);
  });

  it("contradicting traffic (deterministic numeric rule) also rolls back the canary", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);

    const result = await processEvent(TRAFFIC_SPIKE);

    expect(result.intervention?.type).toBe("canary_rollback");
    expect(result.decision?.status).toBe("blocked_pending_review");
  });

  it("blocks the candidate before any canary starts (nothing to roll back)", async () => {
    // Deliberately skip startCanary -- decision is still "ready".
    const result = await processEvent(MARKETING_EVIDENCE);

    expect(result.intervention?.type).toBe("candidate_blocked");
    expect(result.decision?.status).toBe("blocked_pending_review");
    expect(result.decision?.canaryPercentage).toBe(0);
  });

  it("escalates to a critical incident if the candidate is already fully rolled out", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);
    const db = await getDb();
    await db
      .collection("decisions")
      .updateOne({ _id: decision!._id }, { $set: { canaryPercentage: 100 } });

    const result = await processEvent(MARKETING_EVIDENCE);

    expect(result.intervention?.type).toBe("critical_incident_escalation");
    expect(result.decision?.status).toBe("critical_incident");
  });

  it("a fresh read from MongoDB returns the blocked state (persistence proof)", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);
    await processEvent(MARKETING_EVIDENCE);

    const freshRead = await findCurrentDecision("demo-company");
    expect(freshRead?.status).toBe("blocked_pending_review");
    expect(freshRead?.interventions.length).toBe(1);
  });

  it("does not create a duplicate intervention when the same event is retried", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);

    const first = await processEvent(MARKETING_EVIDENCE);
    const second = await processEvent(MARKETING_EVIDENCE);

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);

    const freshRead = await findCurrentDecision("demo-company");
    expect(freshRead?.interventions.length).toBe(1);
  });

  it("an event within threshold does not intervene", async () => {
    const decision = await findCurrentDecision("demo-company");
    await startCanary(decision!._id, 5);

    const result = await processEvent(TRAFFIC_WITHIN_THRESHOLD);

    expect(result.intervention).toBeNull();
    expect(result.decision?.status).toBe("canary_deploying");
    expect(result.decision?.canaryPercentage).toBe(5);
  });
});
