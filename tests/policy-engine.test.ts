import { afterEach, describe, expect, it, vi } from "vitest";
import { decidePolicy } from "../lib/policy-engine";
import { classifyRelationship } from "../lib/classifier";
import type { AssumptionDoc, DecisionDoc, EventDoc } from "../lib/types";
import { ObjectId } from "mongodb";

const assumption: Pick<AssumptionDoc, "structuredCondition"> = {
  structuredCondition: { metric: "requests_per_minute", operator: "less_than", threshold: 1000 },
};

describe("policy engine numeric rule", () => {
  it("3,500 RPM contradicts a 1,000 RPM threshold and pauses", () => {
    const event: Pick<EventDoc, "structuredData"> = {
      structuredData: { metric: "requests_per_minute", value: 3500 },
    };
    const decision = decidePolicy(event, assumption, {
      relationship: "irrelevant",
      confidence: 0,
      reason: "n/a",
      classifiedBy: "test",
    });
    expect(decision.action).toBe("pause");
    expect(decision.assumptionNewStatus).toBe("invalidated");
  });

  it("an irrelevant, within-threshold event does not pause the deployment", () => {
    const event: Pick<EventDoc, "structuredData"> = {
      structuredData: { metric: "requests_per_minute", value: 500 },
    };
    const decision = decidePolicy(event, assumption, {
      relationship: "irrelevant",
      confidence: 0.9,
      reason: "Not related to traffic capacity.",
      classifiedBy: "test",
    });
    expect(decision.action).toBe("none");
    expect(decision.assumptionNewStatus).toBe("valid");
  });

  it("numeric rule wins even if the model says supports (fallback safety)", () => {
    const event: Pick<EventDoc, "structuredData"> = {
      structuredData: { metric: "requests_per_minute", value: 4000 },
    };
    const decision = decidePolicy(event, assumption, {
      relationship: "supports",
      confidence: 0.99,
      reason: "Model was wrong.",
      classifiedBy: "test",
    });
    expect(decision.action).toBe("pause");
  });

  it("an uncertain classification challenges the assumption without pausing", () => {
    const event: Pick<EventDoc, "structuredData"> = {
      structuredData: { metric: "requests_per_minute", value: 900 },
    };
    const decision = decidePolicy(event, assumption, {
      relationship: "uncertain",
      confidence: 0.5,
      reason: "Ambiguous signal.",
      classifiedBy: "test",
    });
    expect(decision.action).toBe("challenge");
    expect(decision.assumptionNewStatus).toBe("challenged");
  });
});

describe("classifier deterministic fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the deterministic rule when no model API key is configured", async () => {
    // Force the "no key" path regardless of this environment's real .env,
    // so the test verifies the fallback contract, not ambient config.
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("FIREWORKS_API_KEY", "");
    const event: EventDoc = {
      _id: new ObjectId(),
      tenantId: "demo-company",
      type: "traffic_update",
      content: "Traffic has increased to 3,500 requests per minute.",
      structuredData: { metric: "requests_per_minute", value: 3500 },
      embedding: [],
      candidateAssumptionIds: [],
      classification: null,
      interventionTriggered: false,
      idempotencyKey: "test",
      createdAt: new Date(),
    };
    const fullAssumption: AssumptionDoc = {
      _id: new ObjectId(),
      tenantId: "demo-company",
      decisionId: new ObjectId(),
      category: "traffic",
      content: "Traffic must remain below 1,000 requests per minute.",
      structuredCondition: { metric: "requests_per_minute", operator: "less_than", threshold: 1000 },
      status: "valid",
      embedding: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const decision: DecisionDoc = {
      _id: new ObjectId(),
      tenantId: "demo-company",
      type: "software_deployment",
      title: "Deploy version 2",
      version: "2.0.0",
      status: "deploying",
      progress: 10,
      assumptionIds: [fullAssumption._id],
      revision: 1,
      interventions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await classifyRelationship(event, fullAssumption, decision);
    expect(result.classifiedBy).toBe("deterministic-fallback");
    expect(result.relationship).toBe("contradicts");
  });
});
