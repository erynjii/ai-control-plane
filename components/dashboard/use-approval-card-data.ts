"use client";

// Hook that backs the approval card's PR 3 features:
//   - the latest pipeline_runs row for the asset (for the flag list,
//     the strategy brief row, and the regenerate cost estimates)
//   - the edit count for the "edited" badge
//
// Lazily fetches both when given a non-null assetId; caches per-id in
// module scope so navigating between cards doesn't re-fetch the same
// data repeatedly. Clean slate on refreshKey bump.

import { useCallback, useEffect, useState } from "react";
import type { PipelineContext } from "@/lib/agents/types";

export interface LatestPipelineRun {
  id: string;
  asset_id: string;
  total_cost_usd: number | string;
  duration_ms: number;
  max_flag_severity: "blocker" | "warning" | "note" | null;
  model_versions: Record<string, string>;
  context: PipelineContext;
  created_at: string;
}

export interface EditsSummary {
  count: number;
  latest: { field: string; editedAt: string } | null;
}

export interface ApprovalCardData {
  latestRun: LatestPipelineRun | null;
  edits: EditsSummary | null;
  loading: boolean;
  error: string | null;
}

type CachedEntry = {
  latestRun: LatestPipelineRun | null;
  edits: EditsSummary | null;
};

// Module-level cache keyed by `${assetId}|${refreshKey}` so a refresh
// bump busts everything without mutating shared state.
const cache = new Map<string, CachedEntry>();

export function clearApprovalCardCache(): void {
  cache.clear();
}

async function fetchLatestRun(assetId: string): Promise<LatestPipelineRun | null> {
  const res = await fetch(`/api/pipeline-runs?asset_id=${encodeURIComponent(assetId)}`);
  if (!res.ok) throw new Error(`pipeline-runs ${res.status}`);
  const payload = (await res.json()) as { pipelineRuns?: LatestPipelineRun[] };
  return payload.pipelineRuns?.[0] ?? null;
}

async function fetchEdits(assetId: string): Promise<EditsSummary> {
  const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/edits`);
  if (!res.ok) throw new Error(`edits ${res.status}`);
  const payload = (await res.json()) as EditsSummary;
  return payload;
}

export function useApprovalCardData(
  assetId: string | null,
  refreshKey: number = 0
): ApprovalCardData {
  const [data, setData] = useState<ApprovalCardData>({
    latestRun: null,
    edits: null,
    loading: Boolean(assetId),
    error: null
  });

  const load = useCallback(
    async (id: string, key: number) => {
      const cacheKey = `${id}|${key}`;
      const hit = cache.get(cacheKey);
      if (hit) {
        setData({ ...hit, loading: false, error: null });
        return;
      }
      setData((current) => ({ ...current, loading: true, error: null }));
      try {
        const [latestRun, edits] = await Promise.all([fetchLatestRun(id), fetchEdits(id)]);
        const entry: CachedEntry = { latestRun, edits };
        cache.set(cacheKey, entry);
        setData({ ...entry, loading: false, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load card data.";
        setData({ latestRun: null, edits: null, loading: false, error: message });
      }
    },
    []
  );

  useEffect(() => {
    if (!assetId) {
      setData({ latestRun: null, edits: null, loading: false, error: null });
      return;
    }
    void load(assetId, refreshKey);
  }, [assetId, refreshKey, load]);

  return data;
}
