import type { ClientDecision } from "./types";

const STATUS_LABELS: Record<string, string> = {
  ready: "READY",
  canary_deploying: "CANARY LIVE",
  blocked_pending_review: "BLOCKED",
  critical_incident: "CRITICAL INCIDENT",
};

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-500/15 text-emerald-300",
  canary_deploying: "bg-emerald-500/15 text-emerald-300",
  blocked_pending_review: "bg-red-500/20 text-red-300 border border-red-400/40",
  critical_incident: "bg-red-600/30 text-red-200 border border-red-400/60",
};

const SAFE_TRAFFIC_RPM = 1000;

export function DeploymentCard({
  decision,
  checking,
  currentTrafficRpm,
}: {
  decision: ClientDecision;
  checking: boolean;
  currentTrafficRpm: number | null;
}) {
  const barColor =
    decision.status === "critical_incident" || decision.status === "blocked_pending_review"
      ? "bg-red-500"
      : checking
        ? "bg-amber-500"
        : "bg-emerald-500";

  const displayStatus = checking && decision.status === "canary_deploying" ? "checking" : decision.status;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{decision.title}</p>
          <div className="mt-1 flex items-baseline gap-4">
            <span className="text-xs text-slate-500">
              Production <span className="font-semibold text-slate-200">v{decision.productionVersion}</span>
            </span>
            <span className="text-xl font-semibold text-slate-100">
              Candidate v{decision.candidateVersion}
            </span>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[decision.status] ?? ""}`}
        >
          {checking ? "CHECKING" : STATUS_LABELS[displayStatus] ?? displayStatus}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Canary exposure</span>
          <span>{decision.canaryPercentage}%</span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(decision.canaryPercentage, decision.canaryPercentage > 0 ? 8 : 0)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-6 text-xs">
        <div>
          <p className="text-slate-500">Current traffic</p>
          <p className="font-medium text-slate-200">
            {currentTrafficRpm !== null ? `${currentTrafficRpm.toLocaleString()} RPM` : "—"}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Maximum safe traffic</p>
          <p className="font-medium text-slate-200">{SAFE_TRAFFIC_RPM.toLocaleString()} RPM</p>
        </div>
      </div>
    </div>
  );
}
