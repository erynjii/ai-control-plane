"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

type Counts = {
  low: number;
  medium: number;
  high: number;
  other: number;
};

type ScannerSummaryProps = {
  refreshKey?: number;
};

const EMPTY_COUNTS: Counts = { low: 0, medium: 0, high: 0, other: 0 };

function tally(assets: Asset[]): Counts {
  const counts = { ...EMPTY_COUNTS };
  for (const asset of assets) {
    if (asset.risk_level === "low" || asset.risk_level === "medium" || asset.risk_level === "high") {
      counts[asset.risk_level] += 1;
    } else {
      counts.other += 1;
    }
  }
  return counts;
}

export function ScannerSummary({ refreshKey = 0 }: ScannerSummaryProps) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/assets", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { assets?: Asset[]; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload?.error ?? "Failed to load scan summary.");
        return;
      }

      const assets = payload?.assets ?? [];
      setCounts(tally(assets));
      setTotal(assets.length);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (status === "error" && errorMessage) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {errorMessage}
      </p>
    );
  }

  if (status !== "success") {
    return <p className="text-sm text-slate-400">Loading scan summary...</p>;
  }

  if (total === 0) {
    return <p className="text-sm text-slate-400">No assets scanned yet.</p>;
  }

  const tiles: Array<{ label: string; value: number; classes: string }> = [
    { label: "High", value: counts.high, classes: "border-rose-500/40 bg-rose-500/10 text-rose-200" },
    { label: "Medium", value: counts.medium, classes: "border-amber-500/40 bg-amber-500/10 text-amber-200" },
    { label: "Low", value: counts.low, classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" }
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Risk distribution across your last {total} assets.</p>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-lg border px-3 py-2 ${tile.classes}`}
          >
            <p className="text-[10px] uppercase tracking-wide opacity-80">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
      {counts.other > 0 ? (
        <p className="text-xs text-slate-500">
          {counts.other} asset{counts.other === 1 ? "" : "s"} with unscored risk (legacy).
        </p>
      ) : null}
    </div>
  );
}
