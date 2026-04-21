"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

type Stats = {
  totalAssets: number;
  promotedTotal: number;
  byStatus: {
    draft: number;
    pending_review: number;
    approved: number;
    rejected: number;
    queued: number;
    published: number;
    failed: number;
  };
  byRisk: { low: number; medium: number; high: number; unknown: number };
  publishedTotal?: number;
  failedTotal?: number;
  byDestination?: Record<string, number>;
};

type InsightsCardProps = {
  refreshKey?: number;
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

type Tile = {
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string };
};

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

  const approvalRate = stats
    ? formatPercent(stats.byStatus.approved, stats.byStatus.approved + stats.byStatus.rejected)
    : "—";

  const tiles: Tile[] = [
    { label: "Total created", value: stats ? stats.totalAssets.toLocaleString() : "—" },
    {
      label: "Approval rate",
      value: approvalRate,
      trend: stats && stats.byStatus.approved > 0 ? { direction: "up", label: "12%" } : undefined
    },
    { label: "Published", value: stats ? (stats.publishedTotal ?? 0).toLocaleString() : "—" },
    {
      label: "Failed",
      value: stats ? (stats.failedTotal ?? 0).toLocaleString() : "—",
      trend: stats && (stats.failedTotal ?? 0) > 0 ? { direction: "down", label: "2%" } : undefined
    }
  ];

  return (
    <section className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">Insights</h3>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-canvas-hover"
        >
          <span>This month</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </header>

      {status === "error" ? <p className="text-xs text-signal-danger">Failed to load.</p> : null}
      {status === "loading" && !stats ? <p className="text-xs text-ink-500">Loading…</p> : null}

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-line-soft bg-canvas-input/60 p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {tile.label}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-bold text-ink-100">{tile.value}</p>
              {tile.trend ? (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                    tile.trend.direction === "up" ? "text-signal-success" : "text-signal-danger"
                  }`}
                >
                  {tile.trend.direction === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {tile.trend.label}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
