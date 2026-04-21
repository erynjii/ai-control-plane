const STYLES: Record<string, string> = {
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  high: "border-rose-500/40 bg-rose-500/10 text-rose-300"
};

const FALLBACK = "border-slate-700 bg-slate-800 text-slate-300";

export function RiskBadge({ risk }: { risk: string }) {
  const classes = STYLES[risk] ?? FALLBACK;
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${classes}`}
    >
      {risk || "unknown"}
    </span>
  );
}
