export function EvidenceTrigger({
  onTrigger,
  disabled,
  triggering,
}: {
  onTrigger: () => void;
  disabled: boolean;
  triggering: boolean;
}) {
  return (
    <div>
      <button
        onClick={onTrigger}
        disabled={disabled}
        className="w-full rounded-lg bg-red-600 px-4 py-3 text-left font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
      >
        {triggering ? "Sending evidence..." : "Send Marketing Evidence"}
      </button>
      <p className="mt-1.5 text-xs text-slate-500">
        &ldquo;Marketing moved the product launch to now. Approximately 50,000 users are
        expected.&rdquo;
      </p>
    </div>
  );
}

export function TrafficSpikeTrigger({
  onTrigger,
  disabled,
  triggering,
}: {
  onTrigger: () => void;
  disabled: boolean;
  triggering: boolean;
}) {
  return (
    <button
      onClick={onTrigger}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {triggering ? "Sending event..." : "Trigger Traffic Spike — 3,500 RPM"}
    </button>
  );
}
