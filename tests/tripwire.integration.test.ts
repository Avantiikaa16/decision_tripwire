import { beforeEach, describe, expect, it } from "vitest";
import { resetAndSeedDemo } from "../lib/seed";
import { processEvent } from "../lib/tripwire";
import {
  findCurrentDecision,
  setDecisionStatus,
  incrementProgress,
} from "../lib/repositories/decisions";

// Integration tests run against the real Atlas Hackathon Sandbox cluster
// (same MONGODB_URI as the app), scoped to tenantId "demo-company" only.

describe("tripwire integration (live Atlas sandbox)", () => {
  beforeEach(async () => {
    await resetAndSeedDemo();
  });

  it("moves a decision from ready to deploying", async () => {
    const decision = await findCurrentDecision("demo-company");
    expect(decision?.status).toBe("ready");
    const updated = await setDecisionStatus(decision!._id, "deploying");
    expect(updated?.status).toBe("deploying");
  });

  it("only increments progress while deploying", async () => {
    const decision = await findCurrentDecision("demo-company");
    await setDecisionStatus(decision!._id, "deploying");
    const afterOne = await incrementProgress(decision!._id, 8);
    expect(afterOne?.progress).toBe(8);

    await setDecisionStatus(decision!._id, "paused");
    const afterPause = await incrementProgress(decision!._id, 8);
    expect(afterPause?.progress).toBe(8); // unchanged
    expect(afterPause?.status).toBe("paused");
  });

  it("contradicting traffic invalidates the assumption and pauses the deployment", async () => {
    const decision = await findCurrentDecision("demo-company");
    await setDecisionStatus(decision!._id, "deploying");

    const result = await processEvent({
      content: "Traffic has increased to 3,500 requests per minute.",
      type: "traffic_update",
      requestsPerMinute: 3500,
    });

    expect(result.intervention).not.toBeNull();
    expect(result.decision?.status).toBe("paused");
    expect(result.event.interventionTriggered).toBe(true);
  });

  it("a fresh read from MongoDB returns the paused state (persistence proof)", async () => {
    const decision = await findCurrentDecision("demo-company");
    await setDecisionStatus(decision!._id, "deploying");
    await processEvent({
      content: "Traffic has increased to 3,500 requests per minute.",
      type: "traffic_update",
      requestsPerMinute: 3500,
    });

    const freshRead = await findCurrentDecision("demo-company");
    expect(freshRead?.status).toBe("paused");
    expect(freshRead?.interventions.length).toBe(1);
  });

  it("does not create a duplicate intervention when the same event is retried", async () => {
    const decision = await findCurrentDecision("demo-company");
    await setDecisionStatus(decision!._id, "deploying");

    const payload = {
      content: "Traffic has increased to 3,500 requests per minute.",
      type: "traffic_update" as const,
      requestsPerMinute: 3500,
    };
    const first = await processEvent(payload);
    const second = await processEvent(payload);

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);

    const freshRead = await findCurrentDecision("demo-company");
    expect(freshRead?.interventions.length).toBe(1);
  });

  it("an irrelevant, within-threshold event does not pause the deployment", async () => {
    const decision = await findCurrentDecision("demo-company");
    await setDecisionStatus(decision!._id, "deploying");

    const result = await processEvent({
      content: "Traffic is steady at 400 requests per minute.",
      type: "traffic_update",
      requestsPerMinute: 400,
    });

    expect(result.intervention).toBeNull();
    expect(result.decision?.status).toBe("deploying");
  });
});
