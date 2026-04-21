"use client";

import { useCallback, useEffect, useState } from "react";
import type { Asset } from "@/lib/types";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import {
  DestinationBadge,
  PublishStatusBadge,
  StatusBadge
} from "@/components/dashboard/destination-badge";
import { InstagramPreview } from "@/components/dashboard/instagram-preview";

type Status = "idle" | "loading" | "success" | "error";

type PromotedAssetsCardProps = {
  refreshKey?: number;
  onViewAll?: () => void;
};

export function PromotedAssetsCard({ refreshKey = 0, onViewAll }: PromotedAssetsCardProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/assets?promoted=true&limit=5");
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

  if (status === "error") {
    return <p className="text-sm text-rose-300">Failed to load assets.</p>;
  }
  if (status !== "success") {
    return <p className="text-xs text-slate-400">Loading...</p>;
  }
  if (assets.length === 0) {
    return <p className="text-xs text-slate-400">No saved assets yet.</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {assets.map((asset) => {
          const hasMedia = Boolean(asset.media_url) && asset.media_type !== null;
          const isExpanded = expandedId === asset.id;
          return (
            <li key={asset.id} className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2">
              <div className="flex items-start gap-2">
                {hasMedia ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                    className="shrink-0 overflow-hidden rounded-md border border-slate-800 hover:border-slate-600"
                    aria-label={isExpanded ? "Collapse preview" : "Expand preview"}
                  >
                    {asset.media_type === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={asset.media_url ?? undefined}
                        className="h-12 w-12 object-cover"
                        muted
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.media_url ?? ""}
                        alt="Asset media thumbnail"
                        className="h-12 w-12 object-cover"
                      />
                    )}
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-100">{asset.prompt}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <RiskBadge risk={asset.risk_level} />
                    <StatusBadge status={asset.status} />
                    {asset.destination ? <DestinationBadge destination={asset.destination} /> : null}
                    <PublishStatusBadge status={asset.destination_status} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {new Date(asset.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {hasMedia && isExpanded ? (
                <div className="mt-2">
                  <InstagramPreview
                    imageUrl={asset.media_type === "image" ? asset.media_url : null}
                    videoUrl={asset.media_type === "video" ? asset.media_url : null}
                    caption={asset.output}
                    size="compact"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="w-full text-center text-xs text-cyan-300 hover:text-cyan-200"
        >
          View all
        </button>
      ) : null}
    </div>
  );
}
