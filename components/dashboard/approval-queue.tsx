"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset, AssetStatus } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";

type Status = "idle" | "loading" | "success" | "error";

type ApprovalQueueProps = {
  refreshKey?: number;
  onAction?: () => void;
};

export function ApprovalQueue({ refreshKey = 0, onAction }: ApprovalQueueProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/assets?status=pending_review&promoted=true", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { assets?: Asset[]; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload?.error ?? "Failed to load approval queue.");
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
    load();
  }, [load, refreshKey]);

  const transition = async (id: string, next: AssetStatus) => {
    setPendingId(id);
    setActionError(null);

    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setActionError(payload?.error ?? `Failed to ${next === "approved" ? "approve" : "reject"}.`);
        return;
      }

      setAssets((current) => current.filter((asset) => asset.id !== id));
      onAction?.();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingId(null);
    }
  };

  if (status === "error" && errorMessage) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {errorMessage}
      </p>
    );
  }

  if (status !== "success") {
    return <p className="text-sm text-slate-400">Loading approval queue...</p>;
  }

  if (assets.length === 0) {
    return <p className="text-sm text-slate-400">Nothing waiting on review.</p>;
  }

  return (
    <div className="space-y-2">
      {actionError ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {actionError}
        </p>
      ) : null}
      <ul className="max-h-80 space-y-2 overflow-auto">
        {assets.map((asset) => {
          const isPending = pendingId === asset.id;
          const findingCount = asset.scan_findings?.length ?? 0;
          return (
            <li key={asset.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{asset.prompt}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {asset.model} · {new Date(asset.created_at).toLocaleString()}
                    {findingCount > 0 ? ` · ${findingCount} finding${findingCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <RiskBadge risk={asset.risk_level} />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => transition(asset.id, "rejected")}
                  disabled={isPending}
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "..." : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => transition(asset.id, "approved")}
                  disabled={isPending}
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "..." : "Approve"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
