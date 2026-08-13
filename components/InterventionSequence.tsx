import type { ClientEventResult } from "./types";

const STAGES = [
  "Event received",
  "Relevant assumption found",
  "Contradiction confirmed",
  "Tripwire activated",
];

export function InterventionSequence({
  stage,
  result,
}: {
  stage: number;
  result: ClientEventResult | null;
}) {
  if (stage === 0) return null;

  const paused = stage >= STAGES.length && result?.intervention;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
      <ol className="space-y-2">
        {STAGES.map((label, i) => {
          const stepNumber = i + 1;
          const done = stage > stepNumber || (stage === stepNumber && paused);
          const active = stage === stepNumber && !paused;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 text-sm transition-opacity ${
                stage >= stepNumber ? "opacity-100" : "opacity-30"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-red-500 text-white"
                    : active
                      ? "animate-pulse bg-amber-500 text-white"
                      : "bg-slate-700 text-slate-400"
                }`}
              >
                {done ? "✓" : stepNumber}
              </span>
              <span className={done ? "text-slate-100" : "text-slate-400"}>{label}</span>
            </li>
          );
        })}
      </ol>

      {paused && result && (
        <div className="mt-6 rounded-xl border border-red-500/50 bg-red-950/40 p-5">
          <p className="text-2xl font-bold tracking-wide text-red-400">
            DEPLOYMENT PAUSED
          </p>
          <p className="mt-2 text-sm text-red-100/90">{result.intervention?.reason}</p>
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-slate-500">Observed: </span>
              <span className="font-semibold text-red-300">3,500 RPM</span>
            </div>
            <div>
              <span className="text-slate-500">Limit: </span>
              <span className="font-semibold text-slate-200">1,000 RPM</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Previous state</p>
              <p className="font-medium text-slate-200">
                {result.intervention?.previousStatus}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Current state</p>
              <p className="font-medium text-red-300">
                {result.intervention?.newStatus}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Action</p>
              <p className="font-medium text-slate-200">Automatic intervention</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
