import type { ClientAssumption } from "./types";

const STATUS_STYLES: Record<string, string> = {
  valid: "bg-emerald-500/20 text-emerald-300",
  challenged: "bg-amber-500/20 text-amber-300",
  invalidated: "bg-red-500/20 text-red-300",
  superseded: "bg-slate-600/30 text-slate-300",
};

export function AssumptionCard({ assumption }: { assumption: ClientAssumption }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Assumption</p>
        <p className="mt-1 text-sm text-slate-200">{assumption.content}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[assumption.status] ?? ""}`}
      >
        {assumption.status}
      </span>
    </div>
  );
}
