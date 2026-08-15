"use client";

import { useEffect, useState } from "react";
import { DeploymentCard } from "@/components/DeploymentCard";
import { AssumptionCard } from "@/components/AssumptionCard";
import { EvidenceTrigger, TrafficSpikeTrigger } from "@/components/EventTrigger";
import { InterventionSequence } from "@/components/InterventionSequence";
import { PersistenceProof } from "@/components/PersistenceProof";
import type { ClientAssumption, ClientDecision, ClientEventResult } from "@/components/types";

const MARKETING_EVIDENCE_PAYLOAD = {
  content: "Marketing moved the product launch to now. Approximately 50,000 users are expected.",
  type: "operational_evidence" as const,
  structuredData: { metric: "expected_users", value: 50000 },
};

const TRAFFIC_SPIKE_PAYLOAD = {
  content: "Traffic has increased to 3,500 requests per minute.",
  type: "traffic_update" as const,
  structuredData: { metric: "requests_per_minute", value: 3500 },
};

const BLOCKED_STATUSES = new Set(["blocked_pending_review", "critical_incident"]);

export default function Home() {
  const [decision, setDecision] = useState<ClientDecision | null>(null);
  const [assumptions, setAssumptions] = useState<ClientAssumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [stage, setStage] = useState(0);
  const [eventResult, setEventResult] = useState<ClientEventResult | null>(null);
  const [currentTrafficRpm, setCurrentTrafficRpm] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);

  async function loadDecision() {
    const res = await fetch("/api/decision");
    const data = await res.json();
    if (!data.decision) {
      await fetch("/api/demo/reset", { method: "POST" });
      const retry = await fetch("/api/decision");
      const retryData = await retry.json();
      setDecision(retryData.decision);
      setAssumptions(retryData.assumptions);
    } else {
      setDecision(data.decision);
      setAssumptions(data.assumptions);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Initial load: fetches then seeds if needed. setState calls happen
    // after the awaited fetch resolves, not synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDecision();
  }, []);

  async function handleStart() {
    setStarting(true);
    const res = await fetch("/api/deployment/start", { method: "POST" });
    const data = await res.json();
    if (data.decision) setDecision(data.decision);
    setStarting(false);
  }

  async function handleTrigger(payload: typeof MARKETING_EVIDENCE_PAYLOAD | typeof TRAFFIC_SPIKE_PAYLOAD) {
    if (triggering || decision?.status !== "canary_deploying") return;
    setTriggering(true);
    setEventResult(null);
    setStage(1);
    if (payload.structuredData.metric === "requests_per_minute") {
      setCurrentTrafficRpm(payload.structuredData.value);
    }

    const resultPromise = fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());

    const advance = (n: number, delay: number) =>
      new Promise<void>((resolve) => setTimeout(() => { setStage(n); resolve(); }, delay));

    await advance(2, 450);
    await advance(3, 450);
    const result: ClientEventResult = await resultPromise;
    await advance(4, 450);

    setEventResult(result);
    if (result.decision) setDecision(result.decision);
    if (result.assumptions) setAssumptions(result.assumptions);
    setTriggering(false);
  }

  async function handleReconnect() {
    setReconnecting(true);
    const res = await fetch("/api/demo/reconnect", { method: "POST" });
    const data = await res.json();
    if (data.decision) setDecision(data.decision);
    if (data.assumptions) setAssumptions(data.assumptions);
    setReconnectMessage(
      "State restored from MongoDB. The tripwire intervention survived restart."
    );
    setReconnecting(false);
  }

  async function handleReset() {
    setLoading(true);
    setStage(0);
    setEventResult(null);
    setCurrentTrafficRpm(null);
    setReconnectMessage(null);
    await fetch("/api/demo/reset", { method: "POST" });
    await loadDecision();
  }

  if (loading || !decision) {
    return (
      <main className="flex min-h-screen items-center justify-center text-slate-400">
        Loading Decision Tripwire...
      </main>
    );
  }

  const isBlocked = BLOCKED_STATUSES.has(decision.status);
  const monitorState: "monitoring" | "checking" | "tripwire" =
    isBlocked ? "tripwire" : triggering ? "checking" : "monitoring";
  const monitorLabel = {
    monitoring: "MONITORING",
    checking: "CHECKING",
    tripwire: "TRIPWIRE ACTIVATED",
  }[monitorState];
  const monitorColor = {
    monitoring: "bg-emerald-400",
    checking: "bg-amber-400 animate-pulse",
    tripwire: "bg-red-400 animate-pulse",
  }[monitorState];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              DECISION TRIPWIRE
            </h1>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-300">
              <span className={`h-2 w-2 rounded-full ${monitorColor}`} />
              {monitorLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Assumption-aware safety for autonomous rollouts
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
        >
          Reset demo
        </button>
      </header>

      <div className="space-y-6">
        <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
          <DeploymentCard
            decision={decision}
            checking={triggering}
            currentTrafficRpm={currentTrafficRpm}
          />

          {assumptions.map((a) => (
            <div key={a._id} className="pt-4">
              <AssumptionCard assumption={a} />
            </div>
          ))}

          <div className="space-y-3 pt-4">
            <button
              onClick={handleStart}
              disabled={decision.status !== "ready" || starting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {starting ? "Starting..." : "Start Canary Rollout (5%)"}
            </button>
            <EvidenceTrigger
              onTrigger={() => handleTrigger(MARKETING_EVIDENCE_PAYLOAD)}
              disabled={decision.status !== "canary_deploying" || triggering}
              triggering={triggering}
            />
            <TrafficSpikeTrigger
              onTrigger={() => handleTrigger(TRAFFIC_SPIKE_PAYLOAD)}
              disabled={decision.status !== "canary_deploying" || triggering}
              triggering={triggering}
            />
          </div>
        </div>

        <InterventionSequence stage={stage} result={eventResult} />

        {isBlocked && (
          <PersistenceProof
            onSimulate={handleReconnect}
            loading={reconnecting}
            message={reconnectMessage}
          />
        )}
      </div>
    </main>
  );
}
