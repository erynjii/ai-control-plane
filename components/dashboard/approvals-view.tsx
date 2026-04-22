"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Image as ImageIcon, Video, XCircle } from "lucide-react";
import type { Asset, AssetStatus } from "@/lib/types";
import type { FlagSeverity } from "@/lib/agents/types";
import { ApprovalCardBrief } from "./approval-card-brief";
import { ApprovalCardPill } from "./approval-card-pill";
import { PartialRegenerateMenu } from "./partial-regenerate-menu";
import { EditedBadge } from "./edited-badge";
import { EditDiffViewer } from "./edit-diff-viewer";
import { DestinationBadge, StatusBadge } from "./destination-badge";
import { clearApprovalCardCache, useApprovalCardData } from "./use-approval-card-data";

type LoadStatus = "idle" | "loading" | "success" | "error";

type TabId = "pending" | "approved" | "published" | "all";

type TabDef = {
  id: TabId;
  label: string;
  filterStatus: AssetStatus | null;
  showsCount: boolean;
};

const TABS: TabDef[] = [
  { id: "pending", label: "Pending", filterStatus: "pending_review", showsCount: true },
  { id: "approved", label: "Approved", filterStatus: "approved", showsCount: true },
  { id: "published", label: "Published", filterStatus: "published", showsCount: true },
  { id: "all", label: "All", filterStatus: null, showsCount: false }
];

type Counts = { pending: number; approved: number; published: number };

type ApprovalsViewProps = {
  refreshKey?: number;
  onAction?: () => void;
  onOpenAsset?: (asset: Asset) => void;
};

type StatsPayload = {
  byStatus?: {
    pending_review?: number;
    approved?: number;
    published?: number;
  };
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

function emptyCopy(tab: TabId): { title: string; body: string } {
  switch (tab) {
    case "pending":
      return {
        title: "No approvals pending",
        body: "Drafts sent for approval will show up here. Anything approved moves on to publishing."
      };
    case "approved":
      return {
        title: "Nothing approved yet",
        body: "Approved items will appear here until they’re assigned a destination and published."
      };
    case "published":
      return {
        title: "Nothing published yet",
        body: "Once items are published to a destination they’ll show up here."
      };
    case "all":
    default:
      return {
        title: "No assets in the approval flow",
        body: "Promoted drafts, approvals, and publications will all be listed here."
      };
  }
}

function fetchUrlForTab(tab: TabDef): string {
  const params = new URLSearchParams();
  params.set("promoted", "true");
  params.set("limit", "100");
  if (tab.filterStatus) params.set("status", tab.filterStatus);
  return `/api/assets?${params.toString()}`;
}

export function ApprovalsView({ refreshKey = 0, onAction, onOpenAsset }: ApprovalsViewProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("pending");
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, published: 0 });
  // Local refresh key bumped when a regenerate completes, so the affected
  // card's useApprovalCardData re-fetches. Multiplied with the external
  // refreshKey so parent-driven refresh still busts the cache.
  const [localRefresh, setLocalRefresh] = useState(0);
  // The drawer is single-open; keeping its state at this level means we
  // don't pay the fetch cost per-card and the close path is one callback.
  const [diffAssetId, setDiffAssetId] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/assets/stats");
      if (!response.ok) return;
      const payload = (await response.json().catch(() => null)) as StatsPayload | null;
      const byStatus = payload?.byStatus ?? {};
      setCounts({
        pending: byStatus.pending_review ?? 0,
        approved: byStatus.approved ?? 0,
        published: byStatus.published ?? 0
      });
    } catch {
      // non-fatal — badges just won't update
    }
  }, []);

  const loadList = useCallback(async (tabId: TabId) => {
    const tab = TABS.find((t) => t.id === tabId);
    if (!tab) return;
    setStatus("loading");
    try {
      const response = await fetch(fetchUrlForTab(tab));
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
    loadCounts();
    loadList(activeTab);
  }, [loadCounts, loadList, activeTab, refreshKey]);

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
      setCounts((current) => ({ ...current, pending: Math.max(0, current.pending - 1) }));
      onAction?.();
      loadCounts();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setPendingId(null);
    }
  };

  const refresh = () => {
    clearApprovalCardCache();
    setLocalRefresh((k) => k + 1);
    loadCounts();
    loadList(activeTab);
  };

  const handleRegenerated = () => {
    // A regenerate has landed. Bump the card-data cache key so cards
    // re-fetch and the global lists catch up.
    clearApprovalCardCache();
    setLocalRefresh((k) => k + 1);
    loadCounts();
    loadList(activeTab);
    onAction?.();
  };

  const empty = emptyCopy(activeTab);

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
          onClick={refresh}
          disabled={status === "loading"}
          className="rounded-lg border border-line-soft px-3 py-2 text-xs text-ink-300 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div role="tablist" aria-label="Approval status filter" className="flex gap-1 border-b border-line-soft">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const count =
            tab.id === "pending"
              ? counts.pending
              : tab.id === "approved"
              ? counts.approved
              : tab.id === "published"
              ? counts.published
              : null;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium ${
                isActive ? "text-ink-100" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              <span>{tab.label}</span>
              {tab.showsCount && count !== null ? (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent-cyan/20 px-1.5 text-[10px] font-semibold text-accent-cyan">
                  {count}
                </span>
              ) : null}
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-cyan"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {actionError ? (
        <p className="rounded-md border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-xs text-signal-danger">
          {actionError}
        </p>
      ) : null}

      {status === "error" ? (
        <p className="rounded-md border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-sm text-signal-danger">
          Failed to load assets.
        </p>
      ) : null}

      {status === "success" && assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-soft bg-canvas-card px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-100">{empty.title}</p>
          <p className="text-xs text-ink-500">{empty.body}</p>
        </div>
      ) : null}

      {status === "loading" && assets.length === 0 ? (
        <p className="text-xs text-ink-500">Loading…</p>
      ) : null}

      <ul className="space-y-3">
        {assets.map((asset) => (
          <ApprovalCardItem
            key={asset.id}
            asset={asset}
            activeTab={activeTab}
            refreshKey={localRefresh + refreshKey}
            isPending={pendingId === asset.id}
            onApprove={() => transition(asset.id, "approved")}
            onReject={() => transition(asset.id, "rejected")}
            onOpen={onOpenAsset ? () => onOpenAsset(asset) : undefined}
            onOpenEdits={() => setDiffAssetId(asset.id)}
            onRegenerated={handleRegenerated}
          />
        ))}
      </ul>

      <EditDiffViewer assetId={diffAssetId} onClose={() => setDiffAssetId(null)} />
    </div>
  );
}

interface ApprovalCardItemProps {
  asset: Asset;
  activeTab: TabId;
  refreshKey: number;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpen?: () => void;
  onOpenEdits: () => void;
  onRegenerated: () => void;
}

function ApprovalCardItem({
  asset,
  activeTab,
  refreshKey,
  isPending,
  onApprove,
  onReject,
  onOpen,
  onOpenEdits,
  onRegenerated
}: ApprovalCardItemProps) {
  const cardData = useApprovalCardData(asset.id, refreshKey);

  const captionPreview = asset.output.replace(/\s+/g, " ").slice(0, 220);
  const showPublishedAt = activeTab === "published" && asset.published_at;
  const showReviewButtons = activeTab === "pending";
  const editsCount = cardData.edits?.count ?? 0;
  const showEditedBadge = activeTab !== "pending" && editsCount > 0;
  const brief = cardData.latestRun?.context.brief;
  const v2 = Boolean(cardData.latestRun);
  const flags = cardData.latestRun?.context.flags ?? [];
  const maxSeverity: FlagSeverity | null =
    (cardData.latestRun?.max_flag_severity as FlagSeverity | null | undefined) ?? null;

  return (
    <li className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <div className="flex gap-4">
        <Thumbnail asset={asset} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-100">{asset.prompt}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {asset.model} ·{" "}
                {showPublishedAt && asset.published_at
                  ? `published ${formatDateTime(asset.published_at)}`
                  : formatDateTime(asset.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <ApprovalCardPill
                riskLevel={asset.risk_level}
                maxFlagSeverity={maxSeverity}
                flags={flags}
                v1Fallback={!v2}
              />
              <StatusBadge status={asset.status} />
              {asset.destination ? <DestinationBadge destination={asset.destination} /> : null}
              {showEditedBadge ? <EditedBadge count={editsCount} onClick={onOpenEdits} /> : null}
            </div>
          </div>

          {captionPreview ? (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-300">
              {captionPreview}
              {asset.output.length > captionPreview.length ? "…" : ""}
            </p>
          ) : null}

          {v2 ? <div className="mt-2"><ApprovalCardBrief brief={brief} /></div> : null}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-line-soft px-3 py-1.5 text-xs text-ink-300 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
            ) : null}
            {showReviewButtons ? (
              <>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-lg border border-line-soft px-3 py-1.5 text-xs text-ink-300 hover:border-signal-danger/50 hover:text-signal-danger disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </button>
                {v2 ? (
                  <PartialRegenerateMenu
                    assetId={asset.id}
                    brief={brief}
                    onRegenerated={onRegenerated}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
