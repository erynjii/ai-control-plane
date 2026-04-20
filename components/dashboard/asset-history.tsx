"use client";

import { useCallback, useEffect, useState } from "react";

type Asset = {
  id: string;
  workspace_id: string;
  prompt: string;
  output: string;
  model: string;
  status: string;
  risk_level: string;
  created_at: string;
  updated_at: string;
};

type Status = "idle" | "loading" | "success" | "error";

type AssetHistoryProps = {
  refreshKey?: number;
};

export function AssetHistory({ refreshKey = 0 }: AssetHistoryProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/assets", { method: "GET" });

      const payload = (await response.json().catch(() => null)) as
        | { assets?: Asset[]; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload?.error ?? "Failed to load assets.");
        return;
      }

      setAssets(payload?.assets ?? []);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets, refreshKey]);

  const isLoading = status === "loading";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {status === "success" ? `${assets.length} recent ${assets.length === 1 ? "asset" : "assets"}` : " "}
        </p>
        <button
          type="button"
          onClick={loadAssets}
          disabled={isLoading}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {status === "error" && errorMessage ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      {status === "success" && assets.length === 0 ? (
        <p className="text-sm text-slate-400">No assets yet. Generate one from the workspace above.</p>
      ) : null}

      {assets.length > 0 ? (
        <ul className="max-h-80 space-y-2 overflow-auto">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-100">{asset.prompt}</span>
                <span className="shrink-0 rounded-md border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  {asset.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {asset.model} · {new Date(asset.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
