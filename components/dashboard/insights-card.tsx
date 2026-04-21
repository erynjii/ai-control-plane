"use client";

import { useCallback, useEffect, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

type Stats = {
  totalAssets: number;
  promotedTotal: number;
  byStatus: { draft: number; pending_review: number; approved: number; rejected: number };
  byRisk: { low: number; medium: number; high: number; unknown: number };
};

type InsightsCardProps = {
  refreshKey?: number;
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function InsightsCard({ refreshKey = 0 }: InsightsCardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/assets/stats");
      const payload = (await response.json().catch(() => null)) as Stats | null;
      if (!response.ok || !payload) {
        setStatus("error");
        return;
      }
      setStats(payload);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (status === "error") {
    return <p className="text-sm text-rose-300">Failed to load insights.</p>;
  }
  if (status !== "success" || !stats) {
    return <p className="text-xs text-slate-400">Loading...</p>;
  }

  const decided = stats.byStatus.approved + stats.byStatus.rejected;
  const approvalRate = formatPercent(stats.byStatus.approved, decided);
  const lowRiskPct = formatPercent(stats.byRisk.low, stats.promotedTotal);

  const rows: Array<{ label: string; value: string }> = [
    { label: "Total generated", value: stats.totalAssets.toLocaleString() },
    { label: "Approval rate", value: approvalRate },
    { label: "% low risk", value: lowRiskPct }
  ];

  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-slate-400">{row.label}</dt>
          <dd className="text-sm font-semibold text-slate-100">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
