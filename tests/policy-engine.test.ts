import { afterEach, describe, expect, it, vi } from "vitest";
import { decidePolicy } from "../lib/policy-engine";
import { classifyRelationship } from "../lib/classifier";
import type { AssumptionDoc, DecisionDoc, EventDoc } from "../lib/types";
import { ObjectId } from "mongodb";

const assumption: Pick<AssumptionDoc, "structuredCondition"> = {
  structuredCondition: { metric: "requests_per_minute", operator: "less_than", threshold: 1000 },
};

const trafficEvent: Pick<EventDoc, "structuredData"> = {
  structuredData: { metric: "requests_per_minute", value: 3500 },
};

const withinThresholdEvent: Pick<EventDoc, "structuredData"> = {
  structuredData: { metric: "requests_per_minute", value: 500 },
};

const evidenceEvent: Pick<EventDoc, "structuredData"> = {
  structuredData: { metric: "expected_users", value: 50000 },
};

const irrelevantClassification = {
  relationship: "irrelevant" as const,
  confidence: 0,
  reason: "n/a",
  classifiedBy: "test",
};

describe("policy engine: whether an assumption is contradicted", () => {
  it("3,500 RPM contradicts a 1,000 RPM threshold via the numeric rule", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, trafficEvent, assumption, irrelevantClassification);
    expect(result.action).toBe("rollback");
    expect(result.assumptionNewStatus).toBe("invalidated");
  });

  it("an event within threshold does not trigger an intervention", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, withinThresholdEvent, assumption, irrelevantClassification);
    expect(result.action).toBe("none");
    expect(result.assumptionNewStatus).toBe("valid");
  });

  it("numeric rule wins even if the model says supports (fallback safety)", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, trafficEvent, assumption, {
      relationship: "supports",
      confidence: 0.99,
      reason: "Model was wrong.",
      classifiedBy: "test",
    });
    expect(result.action).toBe("rollback");
  });

  it("natural-language evidence with no comparable metric relies entirely on the model classification", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, evidenceEvent, assumption, {
      relationship: "contradicts",
      confidence: 0.95,
      reason: "50,000 expected users would far exceed the low-traffic assumption.",
      classifiedBy: "test",
    });
    expect(result.action).toBe("rollback");
    expect(result.assumptionNewStatus).toBe("invalidated");
  });

  it("an uncertain classification challenges the assumption without intervening", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, evidenceEvent, assumption, {
      relationship: "uncertain",
      confidence: 0.4,
      reason: "Ambiguous signal.",
      classifiedBy: "test",
    });
    expect(result.action).toBe("challenge");
    expect(result.assumptionNewStatus).toBe("challenged");
  });
});

describe("policy engine: how to intervene, based on rollout state", () => {
  it("blocks the candidate if the canary never started", () => {
    const decision = { status: "ready" as const, canaryPercentage: 0 };
    const result = decidePolicy(decision, trafficEvent, assumption, irrelevantClassification);
    expect(result.action).toBe("block");
  });

  it("rolls back the canary if it's partially live", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 5 };
    const result = decidePolicy(decision, trafficEvent, assumption, irrelevantClassification);
    expect(result.action).toBe("rollback");
  });

  it("escalates to a critical incident if the rollout is already complete", () => {
    const decision = { status: "canary_deploying" as const, canaryPercentage: 100 };
    const result = decidePolicy(decision, trafficEvent, assumption, irrelevantClassification);
    expect(result.action).toBe("escalate");
  });
});

describe("classifier deterministic fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the deterministic numeric rule for traffic_update events", async () => {
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
      content: "Traffic will remain low during the rollout, below approximately 1,000 requests per minute.",
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
      title: "Canary rollout to v2.0.0",
      productionVersion: "1.0.0",
      candidateVersion: "2.0.0",
      status: "canary_deploying",
      canaryPercentage: 5,
      previousCanaryPercentage: 0,
      rollbackCompleted: false,
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

  it("returns uncertain (not a guess) for natural-language evidence when no model is reachable", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("FIREWORKS_API_KEY", "");

    const event: EventDoc = {
      _id: new ObjectId(),
      tenantId: "demo-company",
      type: "operational_evidence",
      content: "Marketing moved the product launch to now. Approximately 50,000 users are expected.",
      structuredData: { metric: "expected_users", value: 50000 },
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
      content: "Traffic will remain low during the rollout, below approximately 1,000 requests per minute.",
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
      title: "Canary rollout to v2.0.0",
      productionVersion: "1.0.0",
      candidateVersion: "2.0.0",
      status: "canary_deploying",
      canaryPercentage: 5,
      previousCanaryPercentage: 0,
      rollbackCompleted: false,
      assumptionIds: [fullAssumption._id],
      revision: 1,
      interventions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await classifyRelationship(event, fullAssumption, decision);
    expect(result.classifiedBy).toBe("deterministic-fallback");
    expect(result.relationship).toBe("uncertain");
  });
});
