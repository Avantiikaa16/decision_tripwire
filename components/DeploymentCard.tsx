import type { ClientDecision } from "./types";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-300",
  deploying: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-red-500/20 text-red-300 border border-red-400/40",
  completed: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
  cancelled: "bg-slate-600/40 text-slate-300 border border-slate-500/40",
};

export function DeploymentCard({
  decision,
  checking,
}: {
  decision: ClientDecision;
  checking: boolean;
}) {
  const barColor =
    decision.status === "paused"
      ? "bg-red-500"
      : checking
        ? "bg-amber-500"
        : decision.status === "completed"
          ? "bg-emerald-500"
          : "bg-emerald-500";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Deploy</p>
          <h2 className="text-xl font-semibold text-slate-100">
            {decision.title.replace("Deploy ", "")} &middot; v{decision.version}
          </h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[decision.status] ?? ""}`}
        >
          {checking && decision.status !== "paused" ? "checking" : decision.status}
        </span>
      </div>

      <div className="mt-5">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${decision.progress}%` }}
          />
        </div>
        <p className="mt-2 text-right text-xs text-slate-500">{decision.progress}%</p>
      </div>
    </div>
  );
}
