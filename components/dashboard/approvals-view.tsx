"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Image as ImageIcon, Video, XCircle } from "lucide-react";
import type { Asset, AssetStatus } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";

type Status = "idle" | "loading" | "success" | "error";

type ApprovalsViewProps = {
  refreshKey?: number;
  onAction?: () => void;
  onOpenAsset?: (asset: Asset) => void;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function Thumbnail({ asset }: { asset: Asset }) {
  if (asset.media_url && asset.media_type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.media_url}
        alt=""
        className="h-24 w-24 shrink-0 rounded-xl border border-line-soft object-cover"
      />
    );
  }
  if (asset.media_url && asset.media_type === "video") {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-canvas-input text-ink-400">
        <Video className="h-7 w-7" />
      </div>
    );
  }
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-canvas-input text-ink-400">
      <ImageIcon className="h-7 w-7" />
    </div>
  );
}

export function ApprovalsView({ refreshKey = 0, onAction, onOpenAsset }: ApprovalsViewProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/assets?status=pending_review&promoted=true&limit=50");
      const payload = (await response.json().catch(() => null)) as { assets?: Asset[] } | null;
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setAssets(payload?.assets ?? []);
      setStatus("success");
    } catch {
      setStatus("error");
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
        setActionError(payload?.error ?? "Action failed.");
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

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 pb-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">Approvals Queue</h1>
          <p className="mt-1 text-sm text-ink-400">
            Review every draft that’s been sent for approval. Approved items move on to destination
            assignment; rejected items return to draft.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={status === "loading"}
          className="rounded-lg border border-line-soft px-3 py-2 text-xs text-ink-300 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {actionError ? (
        <p className="rounded-md border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
          {actionError}
        </p>
      ) : null}

      {status === "error" ? (
        <p className="rounded-md border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-sm text-signal-danger">
          Failed to load approvals.
        </p>
      ) : null}

      {status === "success" && assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-soft bg-canvas-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-100">No approvals pending</p>
          <p className="text-xs text-ink-500">
            Drafts sent for approval will show up here. Anything approved moves on to publishing.
          </p>
        </div>
      ) : null}

      {status === "loading" && assets.length === 0 ? (
        <p className="text-xs text-ink-500">Loading…</p>
      ) : null}

      <ul className="space-y-3">
        {assets.map((asset) => {
          const isPending = pendingId === asset.id;
          const captionPreview = asset.output.replace(/\s+/g, " ").slice(0, 220);
          return (
            <li
              key={asset.id}
              className="rounded-xl border border-line-soft bg-canvas-card p-4"
            >
              <div className="flex gap-4">
                <Thumbnail asset={asset} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-100">{asset.prompt}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {asset.model} · {formatDateTime(asset.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <RiskBadge risk={asset.risk_level} />
                      <span className="inline-flex items-center rounded-full bg-signal-warning/15 px-2 py-0.5 text-[10px] font-medium text-signal-warning">
                        Pending
                      </span>
                    </div>
                  </div>
                  {captionPreview ? (
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-300">
                      {captionPreview}
                      {asset.output.length > captionPreview.length ? "…" : ""}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {onOpenAsset ? (
                      <button
                        type="button"
                        onClick={() => onOpenAsset(asset)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-line-soft px-3 py-1.5 text-xs text-ink-300 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => transition(asset.id, "rejected")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-line-soft px-3 py-1.5 text-xs text-ink-300 hover:border-signal-danger/50 hover:text-signal-danger disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => transition(asset.id, "approved")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
