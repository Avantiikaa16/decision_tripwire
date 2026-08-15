import type { ClientEventResult } from "./types";

const STAGES = [
  "Event received",
  "Relevant assumption found",
  "Contradiction confirmed",
  "Tripwire activated",
];

function InterventionBanner({ result }: { result: ClientEventResult }) {
  const intervention = result.intervention;
  if (!intervention) return null;

  if (intervention.type === "canary_rollback") {
    return (
      <div className="mt-6 rounded-xl border border-red-500/50 bg-red-950/40 p-5">
        <p className="text-2xl font-bold tracking-wide text-red-400">CANARY ROLLED BACK</p>
        <p className="mt-2 text-sm text-red-100/90">
          Further rollout stopped. The {result.decision?.previousCanaryPercentage}% canary was
          rolled back, and production remains safely on v{intervention.toVersion}.
        </p>
        <p className="mt-3 text-sm font-semibold text-red-200">
          v{intervention.fromVersion} BLOCKED PENDING REVIEW &nbsp;·&nbsp; v{intervention.toVersion}{" "}
          REMAINS ACTIVE
        </p>
        <p className="mt-3 text-xs text-red-100/70">{intervention.reason}</p>
      </div>
    );
  }

  if (intervention.type === "candidate_blocked") {
    return (
      <div className="mt-6 rounded-xl border border-red-500/50 bg-red-950/40 p-5">
        <p className="text-2xl font-bold tracking-wide text-red-400">
          v{result.decision?.candidateVersion} BLOCKED PENDING REVIEW
        </p>
        <p className="mt-2 text-sm text-red-100/90">
          The candidate was blocked before receiving any traffic.
        </p>
        <p className="mt-3 text-sm font-semibold text-red-200">
          v{result.decision?.productionVersion} REMAINS ACTIVE
        </p>
        <p className="mt-3 text-xs text-red-100/70">{intervention.reason}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-red-500/50 bg-red-950/40 p-5">
      <p className="text-2xl font-bold tracking-wide text-red-400">CRITICAL INCIDENT</p>
      <p className="mt-2 text-sm text-red-100/90">
        The candidate was already fully rolled out — this can&apos;t be safely undone
        automatically. Escalating for manual review instead of pretending to roll back.
      </p>
      <p className="mt-3 text-xs text-red-100/70">{intervention.reason}</p>
    </div>
  );
}

export function InterventionSequence({
  stage,
  result,
}: {
  stage: number;
  result: ClientEventResult | null;
}) {
  if (stage === 0) return null;

  const done = stage >= STAGES.length && result?.intervention;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
      <ol className="space-y-2">
        {STAGES.map((label, i) => {
          const stepNumber = i + 1;
          const stepDone = stage > stepNumber || (stage === stepNumber && done);
          const active = stage === stepNumber && !done;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 text-sm transition-opacity ${
                stage >= stepNumber ? "opacity-100" : "opacity-30"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  stepDone
                    ? "bg-red-500 text-white"
                    : active
                      ? "animate-pulse bg-amber-500 text-white"
                      : "bg-slate-700 text-slate-400"
                }`}
              >
                {stepDone ? "✓" : stepNumber}
              </span>
              <span className={stepDone ? "text-slate-100" : "text-slate-400"}>{label}</span>
            </li>
          );
        })}
      </ol>

      {done && result && <InterventionBanner result={result} />}
    </div>
  );
}
