"use client";

import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon, Video } from "lucide-react";
import type { Asset, AssetStatus } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

type ApprovalQueueProps = {
  refreshKey?: number;
  onAction?: () => void;
  onSelectAsset?: (asset: Asset) => void;
  onCountChange?: (count: number) => void;
  onViewAll?: () => void;
};

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Thumbnail({ asset }: { asset: Asset }) {
  if (asset.media_url && asset.media_type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.media_url}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg border border-line-soft object-cover"
      />
    );
  }
  if (asset.media_url && asset.media_type === "video") {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line-soft bg-canvas-input text-ink-400">
        <Video className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line-soft bg-canvas-input text-ink-400">
      <ImageIcon className="h-5 w-5" />
    </div>
  );
}

export function ApprovalQueue({
  refreshKey = 0,
  onAction,
  onSelectAsset,
  onCountChange,
  onViewAll
}: ApprovalQueueProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/assets?status=pending_review&promoted=true", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as { assets?: Asset[] } | null;
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const rows = payload?.assets ?? [];
      setAssets(rows);
      onCountChange?.(rows.length);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const transition = async (id: string, next: AssetStatus) => {
    setPendingId(id);
    try {
      const response = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!response.ok) return;
      setAssets((current) => {
        const next = current.filter((asset) => asset.id !== id);
        onCountChange?.(next.length);
        return next;
      });
      onAction?.();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">Approvals Queue</h3>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs text-accent-cyan hover:underline"
          >
            View all
          </button>
        ) : null}
      </header>

      {status === "loading" ? <p className="text-xs text-ink-500">Loading…</p> : null}
      {status === "error" ? <p className="text-xs text-signal-danger">Failed to load.</p> : null}
      {status === "success" && assets.length === 0 ? (
        <p className="text-xs text-ink-500">Nothing waiting on review.</p>
      ) : null}

      <ul className="space-y-3">
        {assets.slice(0, 4).map((asset) => {
          const isPending = pendingId === asset.id;
          return (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onSelectAsset?.(asset)}
                className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left hover:bg-canvas-hover"
              >
                <Thumbnail asset={asset} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-100">{asset.prompt}</p>
                  <p className="mt-0.5 text-xs text-ink-500">Requested by you</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-signal-warning/15 px-2 py-0.5 text-[10px] font-medium text-signal-warning">
                      Pending
                    </span>
                    <span className="text-[10px] text-ink-500">{formatClock(asset.created_at)}</span>
                  </div>
                </div>
              </button>
              <div className="mt-2 flex items-center justify-end gap-2 pl-[60px]">
                <button
                  type="button"
                  onClick={() => transition(asset.id, "rejected")}
                  disabled={isPending}
                  className="rounded-md border border-line-soft px-2 py-1 text-[11px] text-ink-300 hover:border-signal-danger/50 hover:text-signal-danger disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => transition(asset.id, "approved")}
                  disabled={isPending}
                  className="rounded-md bg-accent-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
