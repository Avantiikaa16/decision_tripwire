# Decision Tripwire

**Assumption-aware intervention for autonomous agents.**

Built for the MongoDB "No Cold Start" hackathon (Persistent Context Sprint, .local Build Fest SF, 2026-08-13).

## Problem

AI agents make decisions from assumptions, but they rarely notice when those assumptions stop being true. A deployment agent approves a rollout because "traffic is currently low." Traffic spikes an hour later. Nothing about that agent's world model changes — it has no memory of what the decision depended on, so it can't know the decision is now unsafe.

## Solution

Decision Tripwire stores every decision together with the explicit, structured assumptions that justify it. When new operational evidence arrives, it retrieves the assumptions that evidence might affect, reasons about whether it actually contradicts them, and — if so — automatically pauses the action. The intervention and the new state are persisted in MongoDB, so the pause survives a restart. The agent never returns to a cold start: what it stored changes what it does next.

The MVP demo scenario: a deployment agent approves version 2 on the assumption that traffic stays below 1,000 req/min. Traffic hits 3,500 req/min. Decision Tripwire notices, pauses the deployment, and the pause persists.

## Why MongoDB is load-bearing

MongoDB isn't just a place logs are written to — it's the thing that makes the intervention real:

- **Decisions, assumptions, and events are structured documents**, not prompt text. The `decisions` collection is queried to decide whether a simulated deployment is allowed to keep progressing on every tick.
- **Atlas Vector Search** retrieves the assumptions a new event might be relevant to (see [Retrieval-then-reasoning](#retrieval-then-reasoning-explanation) below).
- **The paused state is read from MongoDB on every request**, including after `POST /api/demo/reconnect` and a full browser refresh. There is no server-side session or in-memory cache holding the "real" state — MongoDB is the source of truth, so the paused state survives restarts.

## Architecture

```
Deployment Agent
    | creates decision + explicit assumption
    v
MongoDB (decisions, assumptions)
    |
    v
Simulated Deployment Executor  --  progress increments only while status = "deploying"
    |
    v
Operational Event Ingestion  --  POST /api/events
    | embeds incoming traffic event (if EMBEDDING_API_KEY configured)
    v
Atlas Vector Search  --  retrieves candidate assumptions (falls back to structured lookup)
    |
    v
Contradiction Classifier  --  LLM returns supports | contradicts | irrelevant | uncertain
    |
    v
Deterministic Policy Layer  --  owns the final pause/challenge/none decision
    |
    v
Intervention Workflow  --  pauses the deployment
    |
    v
MongoDB  --  persists event, classification, intervention, and new decision state
    |
    v
Fresh browser / server session reloads the PAUSED state
```

## Data model

Three collections: `decisions`, `assumptions`, `events`. Intervention history is embedded directly in the decision document (see `lib/types.ts` for the full shapes) to keep the write path simple for the MVP.

## Retrieval-then-reasoning explanation

> Atlas Vector Search retrieves assumptions that may be affected. It does not decide that an assumption was violated. A reasoning and deterministic policy layer makes that decision.

Concretely:

1. `lib/vector-search.ts` retrieves up to 3 candidate assumptions — via `$vectorSearch` if an embedding was computed and the index is ready, otherwise via a structured category match (`lib/vector-search.ts`'s `structuredCandidateLookup`). Either way, this step only narrows candidates; it never itself decides contradiction.
2. `lib/classifier.ts` sends the event + candidate assumption + decision to an LLM (OpenRouter, or Fireworks as fallback) and asks it to classify the relationship as `supports | contradicts | irrelevant | uncertain` with a confidence and reason, as structured JSON. If no model API key is configured, or the model call fails/times out/returns invalid JSON, this step falls back to a deterministic numeric classification — same output shape, `classifiedBy: "deterministic-fallback"`.
3. `lib/policy-engine.ts` owns the actual pause/challenge/none decision. The numeric rule (`actualTrafficRpm > maximumTrafficRpm`) is checked first and independently of the model output, so the demo's outcome never depends on model availability or correctness. Only if the numeric rule doesn't fire does the model's `contradicts` (confidence ≥ 0.8) or `uncertain` classification affect the outcome.

## Integrations genuinely implemented

- ✅ **MongoDB persistence** — `decisions`, `assumptions`, `events` collections on the MongoDB Atlas Hackathon Sandbox cluster. Verified live (see `tests/tripwire.integration.test.ts`, which runs against the real cluster).
- ✅ **LLM contradiction classification (OpenRouter)** — implemented in `lib/classifier.ts` with structured JSON output and validation, using `openai/gpt-4o-mini` via OpenRouter. **Verified live**: a real traffic-spike event returns `classifiedBy: "openrouter"` with a genuine model-generated `reason`, not the fallback text. The deterministic numeric rule still owns the final pause decision either way (see below) — the model's classification is real, but it isn't what's actually gating the intervention for this scenario.
- ⚠️ **Atlas Vector Search** — the `assumptions_vector_index` index is created via `npm run create-vector-index` (confirmed running on the M10 sandbox cluster) and the `$vectorSearch` aggregation path in `lib/vector-search.ts` is implemented and wired in. **Live status:** no `EMBEDDING_API_KEY` is configured, so the running demo retrieves candidates via the **structured fallback path**, not `$vectorSearch`, end to end. The vector search code path is real and reachable, not a stub, but has not been exercised against live embeddings in this submission.
- ❌ **LangGraph / LangSmith** — not implemented, despite a LangSmith key being available. Explicitly P2 in the priority plan and out of scope once P0/P1 consumed the available time.
- ❌ **ElevenLabs** — not implemented, per the priority plan.

The numeric-rule-first design is a deliberate reliability property, not a shortfall being excused: the spec required the demo to work when the model API is slow, unavailable, or misconfigured, and it does — because the deterministic policy layer, not the model, owns the final call. With a real key wired in, the model classification is now also genuinely computed and stored on every event (visible in the `classification` field), giving judges two independent, agreeing signals rather than one.

## Local setup

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI at minimum
npm run dev
```

Visit `http://localhost:3000` (the app will auto-seed the demo decision on first load if none exists).

## Environment variables

See `.env.example`. Only `MONGODB_URI` is required for the core demo. `OPENROUTER_API_KEY` (or `FIREWORKS_API_KEY`) and `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` are optional — when unset, the app runs entirely on the deterministic fallback path described above. This submission runs with a live `OPENROUTER_API_KEY`.

## Demo instructions

1. Load the app. It seeds a `Deploy version 2` decision with one assumption ("traffic must remain below 1,000 req/min").
2. Click **Start Deployment** — progress begins advancing.
3. Click **Trigger Traffic Spike** — this sends a 3,500 req/min event.
4. Watch the intervention sequence animate, ending in **DEPLOYMENT PAUSED** with the reason, previous/current state.
5. Click **Simulate Fresh Session** (or just refresh the browser) — the paused state is re-read from MongoDB, proving persistence.
6. **Reset demo** (top-right) clears only `tenantId: "demo-company"` records and reseeds, for repeat runs.

## Testing instructions

```bash
npm test
```

Runs against the live Atlas Hackathon Sandbox cluster (uses the same `MONGODB_URI`, scoped to `tenantId: "demo-company"`). Covers: status transitions, progress-only-while-deploying, the numeric contradiction rule, assumption invalidation, deployment pausing, paused deployments not progressing, duplicate-event idempotency, fresh-read persistence, deterministic classifier fallback, and irrelevant events not pausing.

## What was built during the hackathon

Everything in this repository — the Next.js app, all API routes, the tripwire pipeline (retrieval → classification → policy → persistence), the UI, the vector index script, and the test suite — was built during the "No Cold Start" MongoDB hackathon session on 2026-08-13.

## Limitations

- Single demo scenario (software deployment / traffic threshold) — the assumption schema is general (`structuredCondition` is metric/operator/threshold) but only one metric type is wired into the UI and seed data.
- No auth, no multi-tenancy beyond a single hardcoded `tenantId`, no real deployment infrastructure — all deliberately out of scope per the MVP priorities.
- Vector search and LLM classification are implemented but unverified live at submission time due to hackathon promo-code exhaustion (see above); the deterministic fallback path carries the demo.
- Re-evaluation after a pause is manual (cancel or stay paused) — no automatic resume, by design, since that would require a new valid assumption to be stored.

## Future improvements

- Wire a real `EMBEDDING_API_KEY` (e.g. Voyage AI, MongoDB's own embeddings partner for this event) and exercise `$vectorSearch` end-to-end live — the index already exists on the cluster and the retrieval code path is ready for it.
- Generalize `structuredCondition` beyond a single metric so Decision Tripwire can watch multiple assumption types per decision.
- LangGraph state machine + LangSmith tracing for the ingestion → classification → policy → intervention pipeline, as technical proof of the reasoning path (not as the main UI).
- Automatic re-evaluation: if a new event later restores a previously invalidated assumption, propose (not auto-apply) resuming the paused decision.
