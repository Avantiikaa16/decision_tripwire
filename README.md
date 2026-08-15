# Decision Tripwire

**Assumption-aware safety for autonomous rollouts.**

Originally built for the MongoDB "No Cold Start" hackathon (Persistent Context Sprint, .local Build Fest SF, 2026-08-13).

> **Note on timeline:** the version submitted to the hackathon used a simpler pause/resume model on a single numeric traffic-spike scenario, with `$vectorSearch` implemented but not exercised live (no embedding key at submission time). Everything described below — the canary/rollback state machine, the natural-language evidence scenario, and live Atlas Vector Search — was built **after** the submission deadline, as continued portfolio work. See git history for the exact split.

## Submission description

Decision Tripwire is an assumption-aware safety layer for autonomous rollout systems. It stores a decision (a canary rollout) together with the assumption that justified it in MongoDB Atlas. When new evidence arrives — including natural language, not just structured metrics — Atlas Vector Search retrieves the assumptions that evidence might affect, a Fireworks-hosted LLM (OpenRouter as a live-verified fallback) classifies whether it actually contradicts them, and a deterministic policy engine chooses the safe intervention for the rollout's current state: block a candidate that never received traffic, roll back a live canary, or escalate a fully-rolled-out release instead of pretending it can be paused. Every event, classification, and intervention persists in MongoDB, so the blocked state survives a restart.

**Positioning:** traditional deployment systems (metric alarms, canary releases, automatic rollback) already react after a configured metric crosses a threshold. Decision Tripwire acts earlier, by connecting *new information* — including plain-English operational evidence with no matching metric at all — to the assumptions that were used to approve the action in the first place. It's not a replacement for deployment platforms; it's an assumption-aware layer that sits above them.

## Problem

AI agents make decisions from assumptions, but they rarely notice when those assumptions stop being true. A deployment agent approves a canary rollout because "traffic is currently low." Marketing moves up a product launch an hour later. Nothing about that agent's world model changes — it has no memory of what the decision depended on, and no threshold-based alarm was configured for "a marketing announcement," so it can't know the decision is now unsafe.

## Solution

Decision Tripwire stores every decision together with the explicit, structured assumption that justifies it. When new evidence arrives, it retrieves the assumptions that evidence might affect (via real semantic search, not keyword matching), reasons about whether it actually contradicts them, and chooses a safe intervention based on how far the rollout has progressed. The intervention and the new state persist in MongoDB, so the block survives a restart. The agent never returns to a cold start: what it stored changes what it does next.

**The demo scenario:** a deployment agent starts a 5% canary of v2.0.0 on the assumption that traffic stays low during rollout (below ~1,000 req/min). Marketing then announces the launch is happening *now*, expecting ~50,000 users — a natural-language event with no `requests_per_minute` field at all. Atlas Vector Search retrieves the traffic assumption because it's semantically related, Fireworks classifies the announcement as contradicting it, and the policy engine rolls the canary back to v1.0.0 and blocks v2.0.0 pending review. A numeric "Trigger Traffic Spike — 3,500 RPM" event is also available as a fully deterministic fallback path that needs no model at all.

## Why MongoDB is load-bearing

- **Decisions, assumptions, and events are structured documents**, not prompt text. The decision document's `status` and `canaryPercentage` are what the UI and policy engine actually branch on.
- **Atlas Vector Search** genuinely retrieves the assumption a natural-language event affects — verified live, see below — not a keyword or category match.
- **The blocked state is read from MongoDB on every request**, including after `POST /api/demo/reconnect` and a full browser refresh. There is no server-side session or in-memory cache holding the "real" state.

## Architecture

```
Deployment Agent
    | creates decision (production v1, candidate v2) + explicit assumption
    v
MongoDB (decisions, assumptions)
    |
    v
Canary Rollout  --  status: ready -> canary_deploying (5%)
    |
    v
Operational Event Ingestion  --  POST /api/events
    | traffic_update (numeric, deterministic) OR operational_evidence (natural language)
    | embeds the event content (Fireworks qwen3-embedding-8b)
    v
Atlas Vector Search  --  retrieves candidate assumptions (falls back to structured lookup)
    |
    v
Contradiction Classifier  --  LLM returns supports | contradicts | irrelevant | uncertain
    | (numeric events also get an independent deterministic check)
    v
Deterministic Policy Layer  --  chooses block / rollback / escalate / challenge / none
    | based on classification AND the decision's current rollout state
    v
Intervention Workflow  --  blocks candidate, or rolls canary back to production
    |
    v
MongoDB  --  persists event, classification, intervention, and new decision state
    |
    v
Fresh browser / server session reloads the BLOCKED state
```

## Data model

Three collections: `decisions`, `assumptions`, `events`. Intervention history is embedded directly in the decision document (see `lib/types.ts` for the full shapes).

```ts
// decisions
{
  productionVersion: "1.0.0",
  candidateVersion: "2.0.0",
  status: "blocked_pending_review", // ready | canary_deploying | blocked_pending_review | critical_incident
  canaryPercentage: 0,
  previousCanaryPercentage: 5,
  rollbackCompleted: true,
  interventions: [{
    type: "canary_rollback", // | candidate_blocked | critical_incident_escalation
    reason: "...", fromVersion: "2.0.0", toVersion: "1.0.0", createdAt: ISODate,
  }],
}
```

## Retrieval-then-reasoning explanation

> Atlas Vector Search retrieves assumptions that may be affected. It does not decide that an assumption was violated. A reasoning and deterministic policy layer makes that decision.

1. `lib/vector-search.ts` retrieves up to 3 candidate assumptions via `$vectorSearch` (embedding from Fireworks `qwen3-embedding-8b`, 4096 dims), falling back to a structured category match if no embedding or the index isn't ready. This step only narrows candidates; it never decides contradiction.
2. `lib/classifier.ts` sends the event + candidate assumption + decision to an LLM (Fireworks primary, OpenRouter fallback) and asks for structured JSON: `supports | contradicts | irrelevant | uncertain` with confidence and reason. On failure/timeout/invalid JSON, it falls back to a deterministic rule — but only for `traffic_update` events, which have a numeric field comparable to the assumption. `operational_evidence` events (natural language, no comparable metric by design) correctly fall back to `uncertain` rather than guessing, since there's no deterministic basis to judge them without a model.
3. `lib/policy-engine.ts` decides in two steps: first *whether* the assumption is contradicted (numeric rule for `traffic_update`, independent of the model; classification for `operational_evidence`), then *how* to intervene, based on the decision's rollout state — block if the canary never started, roll back if it's live, escalate to a critical incident (not a fake pause) if it's already fully rolled out.

## Integrations genuinely implemented

- ✅ **MongoDB persistence** — `decisions`, `assumptions`, `events` on the MongoDB Atlas Hackathon Sandbox cluster. Verified live (`tests/tripwire.integration.test.ts` runs against the real cluster).
- ✅ **Atlas Vector Search** — `assumptions_vector_index` (4096 dims, cosine) is live and queryable. **Verified live**: a real marketing-evidence event returns `usedVectorSearch: true`, meaning the assumption was genuinely retrieved by semantic similarity, not a keyword/category match — the natural-language event contains no word in common with "traffic" or "requests per minute."
- ✅ **LLM contradiction classification (Fireworks primary, OpenRouter fallback)** — `lib/classifier.ts`, structured JSON with validation. Primary: Fireworks `kimi-k2p6-turbo`. **Verified live**: real events return `classifiedBy: "fireworks"` with a genuine model-generated reason.
- ❌ **LangGraph / LangSmith** — not implemented, despite a LangSmith key being available. Out of scope for the time spent.
- ❌ **ElevenLabs** — not implemented.

The numeric-rule-first design for `traffic_update` events is a deliberate reliability property: that path never depends on model availability. The `operational_evidence` path is deliberately the opposite — it has no numeric shortcut, because demonstrating genuine retrieval + reasoning over free text (not a disguised if-statement) is the actual point of this project.

## Local setup

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI at minimum
npm run create-vector-index   # one-time: creates/updates the Atlas Vector Search index
npm run dev
```

Visit `http://localhost:3000` (the app auto-seeds the demo decision on first load).

## Environment variables

See `.env.example`. Only `MONGODB_URI` is required for the core demo. `FIREWORKS_API_KEY` (or `OPENROUTER_API_KEY`) enables live classification; the same Fireworks key also enables real embeddings/vector search (no separate embeddings provider needed — `EMBEDDING_API_KEY` only matters if you want an OpenAI-compatible provider instead). When no model key is set, `traffic_update` events still work via the deterministic fallback; `operational_evidence` events return `uncertain` and get flagged for review instead of guessing.

## Demo instructions

1. Load the app. It seeds a canary rollout decision (production v1.0.0, candidate v2.0.0) with one assumption: traffic stays low during rollout.
2. Click **Start Canary Rollout (5%)**.
3. Click **Send Marketing Evidence** — the primary path: a natural-language event with no numeric traffic field.
4. Watch the intervention sequence animate, ending in **CANARY ROLLED BACK** / **v2.0.0 BLOCKED PENDING REVIEW** / **v1.0.0 REMAINS ACTIVE**, with the model's actual reasoning shown.
5. Click **Simulate Fresh Session** (or refresh) — the blocked state re-reads from MongoDB.
6. **Reset demo** (top-right) clears only `tenantId: "demo-company"` records and reseeds.

The secondary **Trigger Traffic Spike — 3,500 RPM** button demonstrates the fully deterministic fallback path (no model call needed) from the same starting state.

## Testing instructions

```bash
npm test
```

Runs against the live Atlas Hackathon Sandbox cluster, scoped to `tenantId: "demo-company"`. 19 tests covering: canary start/no-restart, both event types contradicting and rolling back the canary, blocking before any canary starts, escalating a fully-rolled-out candidate, persistence after a fresh read, duplicate-event idempotency, within-threshold events not intervening, the policy engine's block/rollback/escalate/challenge/none branching in isolation, and the deterministic classifier fallback for both event types (including that natural-language evidence correctly returns `uncertain`, not a guess, when no model is reachable).

## What was built during the hackathon vs. after

Built during the 2026-08-13 hackathon window: the Next.js app, all core API routes, the original pause/resume pipeline (retrieval → classification → policy → persistence) on a single numeric traffic scenario, the UI, and the initial test suite.

Built after the deadline as continued portfolio work: the canary/rollback state machine (block / rollback / escalate), the natural-language evidence scenario and its no-numeric-shortcut design, real Atlas Vector Search end-to-end (embeddings via Fireworks), and the corresponding UI, test, and documentation updates.

## Limitations

- Single decision/assumption in the seed data — the schema supports multiple assumptions per decision, but the UI only ever shows the one seeded traffic assumption.
- No auth, no multi-tenancy beyond a single hardcoded `tenantId`, no real deployment infrastructure — all deliberately out of scope.
- The `critical_incident` escalation path (fully-rolled-out candidate) is implemented and tested in the policy engine but has no dedicated UI flow to reach it interactively (it requires canary percentage to reach 100%, which the demo buttons don't drive to).
- No automatic resume — a blocked candidate stays blocked until a human reviews it or a new valid assumption is stored, by design.

## Future improvements

- A UI path to reach and visualize the `critical_incident` escalation state.
- Generalize beyond a single traffic-related assumption per decision.
- LangGraph state machine + LangSmith tracing for the ingestion → classification → policy → intervention pipeline, as technical proof of the reasoning path (not as the main UI).
- ElevenLabs spoken read-aloud of the intervention reason.
