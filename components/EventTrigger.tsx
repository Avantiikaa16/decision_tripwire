export function EventTrigger({
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
      className="w-full rounded-lg bg-red-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
    >
      {triggering ? "Sending event..." : "Trigger Traffic Spike — 3,500 RPM"}
    </button>
  );
}
