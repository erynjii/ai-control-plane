"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

type Status = "idle" | "loading" | "success" | "error";

export type WindowKey = "this_month" | "7d" | "30d";

const WINDOW_OPTIONS: Array<{ key: WindowKey; label: string }> = [
  { key: "this_month", label: "This month" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }
];

type PeriodMetrics = {
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
  publishedTotal: number;
  failedTotal: number;
  byDestination: Record<string, number>;
  approvedCount: number;
  editedApprovedCount: number;
  editRate: number | null;
  timeToApproveSeconds: number | null;
  costPerApprovedUsd: number | null;
};

type StatsPayload = PeriodMetrics & {
  window: WindowKey;
  previousPeriod: PeriodMetrics | null;
};

type InsightsCardProps = {
  refreshKey?: number;
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Rate is derived from counts, not a direct metric, so we compare the
 *  derived rate in both periods rather than expecting it in previousPeriod. */
function approvalRateOf(p: PeriodMetrics): number | null {
  const denom = p.byStatus.approved + p.byStatus.rejected;
  return denom === 0 ? null : p.byStatus.approved / denom;
}

type TrendDirection = "up" | "down";
type Trend = { direction: TrendDirection; label: string };

/** Computes the percent-change between current and previous. direction
 *  follows the numeric delta; the caller decides whether that means "good"
 *  or "bad" via the `higherIsBetter` passed into the tile. Returns null if
 *  previous is missing, 0, or either value is null. */
function deltaTrend(current: number | null, previous: number | null | undefined): Trend | null {
  if (current === null || previous === null || previous === undefined) return null;
  if (previous === 0) return null; // can't divide; "new" is ambiguous as a trend
  const ratio = (current - previous) / previous;
  const pct = Math.round(Math.abs(ratio) * 100);
  if (pct === 0) return null;
  return { direction: ratio >= 0 ? "up" : "down", label: `${pct}%` };
}

type Tile = {
  label: string;
  value: string;
  trend?: Trend;
  /** When true, an "up" trend is rendered green; else red. */
  higherIsBetter?: boolean;
};

export function InsightsCard({ refreshKey = 0 }: InsightsCardProps) {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [windowKey, setWindowKey] = useState<WindowKey>("this_month");
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async (w: WindowKey) => {
    setStatus("loading");
    try {
      const response = await fetch(
        `/api/assets/stats?window=${encodeURIComponent(w)}&compareTo=previous`
      );
      const payload = (await response.json().catch(() => null)) as StatsPayload | null;
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
    load(windowKey);
  }, [load, windowKey, refreshKey]);

  const approvalRate = stats
    ? formatPercent(stats.byStatus.approved, stats.byStatus.approved + stats.byStatus.rejected)
    : "—";

  const previous = stats?.previousPeriod ?? null;

  const tiles: Tile[] = [
    {
      label: "Total created",
      value: stats ? stats.totalAssets.toLocaleString() : "—",
      trend: stats ? deltaTrend(stats.totalAssets, previous?.totalAssets) ?? undefined : undefined,
      higherIsBetter: true
    },
    {
      label: "Approval rate",
      value: approvalRate,
      trend:
        stats
          ? deltaTrend(approvalRateOf(stats), previous ? approvalRateOf(previous) : null) ??
            undefined
          : undefined,
      higherIsBetter: true
    },
    {
      label: "Published",
      value: stats ? stats.publishedTotal.toLocaleString() : "—",
      trend: stats
        ? deltaTrend(stats.publishedTotal, previous?.publishedTotal) ?? undefined
        : undefined,
      higherIsBetter: true
    },
    {
      label: "Failed",
      value: stats ? stats.failedTotal.toLocaleString() : "—",
      trend: stats ? deltaTrend(stats.failedTotal, previous?.failedTotal) ?? undefined : undefined,
      higherIsBetter: false
    }
  ];

  const selectedLabel = WINDOW_OPTIONS.find((o) => o.key === windowKey)?.label ?? "This month";

  function selectWindow(next: WindowKey) {
    setMenuOpen(false);
    setWindowKey(next);
  }

  return (
    <section className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">Insights</h3>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label="Select time window"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-canvas-hover"
          >
            <span>{selectedLabel}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {menuOpen ? (
            <ul
              role="listbox"
              className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-md border border-line-soft bg-canvas-card shadow-lg"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <li key={opt.key} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.key === windowKey}
                    onClick={() => selectWindow(opt.key)}
                    className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-canvas-hover ${
                      opt.key === windowKey ? "text-ink-100" : "text-ink-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      {status === "error" ? <p className="text-xs text-signal-danger">Failed to load.</p> : null}
      {status === "loading" && !stats ? <p className="text-xs text-ink-500">Loading…</p> : null}

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => {
          const trend = tile.trend;
          const good =
            trend === undefined
              ? null
              : tile.higherIsBetter === false
                ? trend.direction === "down"
                : trend.direction === "up";
          return (
            <div
              key={tile.label}
              className="rounded-lg border border-line-soft bg-canvas-input/60 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {tile.label}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-2xl font-bold text-ink-100">{tile.value}</p>
                {trend ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                      good ? "text-signal-success" : "text-signal-danger"
                    }`}
                  >
                    {trend.direction === "up" ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {trend.label}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
