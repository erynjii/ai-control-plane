"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset } from "@/lib/types";
import { DESTINATIONS, type Destination } from "@/lib/integrations/types";

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
};

type PublishingSnapshot = {
  publishedTotal: number;
  failedTotal: number;
  byDestination: Record<Destination, number>;
};

type InsightsCardProps = {
  refreshKey?: number;
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

async function fetchPublishingSnapshot(): Promise<PublishingSnapshot | null> {
  const [publishedRes, failedRes] = await Promise.all([
    fetch("/api/assets?destinationStatus=published&limit=100"),
    fetch("/api/assets?destinationStatus=failed&limit=100")
  ]);

  if (!publishedRes.ok || !failedRes.ok) return null;

  const [publishedPayload, failedPayload] = await Promise.all([
    publishedRes.json().catch(() => null) as Promise<{ assets?: Asset[] } | null>,
    failedRes.json().catch(() => null) as Promise<{ assets?: Asset[] } | null>
  ]);

  const published = publishedPayload?.assets ?? [];
  const failed = failedPayload?.assets ?? [];

  const byDestination: Record<Destination, number> = {
    instagram: 0,
    facebook: 0,
    email: 0,
    website: 0
  };
  for (const asset of published) {
    if (asset.destination && (DESTINATIONS as readonly string[]).includes(asset.destination)) {
      byDestination[asset.destination] += 1;
    }
  }

  return {
    publishedTotal: published.length,
    failedTotal: failed.length,
    byDestination
  };
}

export function InsightsCard({ refreshKey = 0 }: InsightsCardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [publishing, setPublishing] = useState<PublishingSnapshot | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [statsResponse, snapshot] = await Promise.all([
        fetch("/api/assets/stats"),
        fetchPublishingSnapshot()
      ]);
      const payload = (await statsResponse.json().catch(() => null)) as Stats | null;
      if (!statsResponse.ok || !payload || !snapshot) {
        setStatus("error");
        return;
      }
      setStats(payload);
      setPublishing(snapshot);
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
  if (status !== "success" || !stats || !publishing) {
    return <p className="text-xs text-slate-400">Loading...</p>;
  }

  const decided = stats.byStatus.approved + stats.byStatus.rejected;
  const approvalRate = formatPercent(stats.byStatus.approved, decided);
  const lowRiskPct = formatPercent(stats.byRisk.low, stats.promotedTotal);

  const rows: Array<{ label: string; value: string }> = [
    { label: "Total generated", value: stats.totalAssets.toLocaleString() },
    { label: "Approval rate", value: approvalRate },
    { label: "% low risk", value: lowRiskPct },
    { label: "Total published", value: publishing.publishedTotal.toLocaleString() },
    { label: "Total failed", value: publishing.failedTotal.toLocaleString() }
  ];

  const destinationRows = (DESTINATIONS as readonly Destination[]).filter(
    (destination) => publishing.byDestination[destination] > 0
  );

  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-slate-400">{row.label}</dt>
            <dd className="text-sm font-semibold text-slate-100">{row.value}</dd>
          </div>
        ))}
      </dl>

      {destinationRows.length > 0 ? (
        <div className="border-t border-slate-800 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            By destination
          </p>
          <dl className="space-y-1">
            {destinationRows.map((destination) => (
              <div key={destination} className="flex items-baseline justify-between gap-2">
                <dt className="text-xs capitalize text-slate-400">{destination}</dt>
                <dd className="text-sm font-semibold text-slate-100">
                  {publishing.byDestination[destination].toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
