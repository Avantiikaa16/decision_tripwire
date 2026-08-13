export function PersistenceProof({
  onSimulate,
  loading,
  message,
}: {
  onSimulate: () => void;
  loading: boolean;
  message: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <p className="text-sm text-slate-400">Persistence proof</p>
      <button
        onClick={onSimulate}
        disabled={loading}
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Reconnecting..." : "Simulate Fresh Session"}
      </button>
      {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
      <p className="mt-2 text-xs text-slate-500">
        You can also refresh the browser manually — the paused state is read
        from MongoDB, not from local memory.
      </p>
    </div>
  );
}
