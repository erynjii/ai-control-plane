"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Expand,
  Instagram,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Upload,
  Video
} from "lucide-react";
import type { Asset } from "@/lib/types";
import type { Destination } from "@/lib/integrations/types";
import { DESTINATIONS } from "@/lib/integrations/types";
import { ProgressStepper } from "@/components/dashboard/progress-stepper";
import { CaptionEditor } from "@/components/dashboard/caption-editor";
import { MediaThumbnails, type MediaThumbnail } from "@/components/dashboard/media-thumbnails";
import { MediaDetails } from "@/components/dashboard/media-details";

type PostViewProps = {
  asset: Asset;
  onBack?: () => void;
  onEditCaption: (assetId: string, caption: string) => void;
  onRegenerateImage: (assetId: string) => void;
  onUploadMedia: (assetId: string, file: File) => void;
  onSendToApproval: (assetId: string) => void;
  onAssignDestination: (assetId: string, destination: Destination) => void;
  onQueuePublish: (assetId: string) => void;
  onRetry: (assetId: string) => void;
  pending?: boolean;
};

function mediaSizeLabel(): string {
  return "1.2 MB";
}

export function PostView({
  asset,
  onBack,
  onEditCaption,
  onRegenerateImage,
  onUploadMedia,
  onSendToApproval,
  onAssignDestination,
  onQueuePublish,
  onRetry,
  pending = false
}: PostViewProps) {
  const [destinationMenuOpen, setDestinationMenuOpen] = useState(false);

  const thumbnails = useMemo<MediaThumbnail[]>(() => {
    if (!asset.media_url) return [];
    return [
      { id: asset.id, url: asset.media_url, type: asset.media_type ?? "image" }
    ];
  }, [asset.id, asset.media_url, asset.media_type]);

  const title = asset.prompt.length > 80 ? `${asset.prompt.slice(0, 77)}…` : asset.prompt;
  const fileName = asset.media_url ? asset.media_url.split("/").pop() ?? "post.jpg" : "post.jpg";
  const isLocked = asset.status !== "draft" && asset.status !== "pending_review";
  const isFailed = asset.destination_status === "failed";
  const isDraft = asset.status === "draft";
  const isApproved = asset.status === "approved";
  const canQueuePublish = isApproved && asset.destination_status === "assigned";
  const canRetry = asset.destination_status === "failed";
  const needsApproval = asset.status === "draft";

  const primaryLabel = isFailed
    ? "Retry Publish"
    : asset.status === "published"
    ? "Published"
    : asset.status === "queued" || asset.destination_status === "publishing"
    ? "Publishing…"
    : canQueuePublish
    ? "Queue Publish"
    : isApproved
    ? "Choose Destination"
    : asset.status === "pending_review"
    ? "Awaiting Approval"
    : "Send to Approval";

  const primaryDisabled =
    pending ||
    asset.status === "published" ||
    asset.status === "queued" ||
    asset.destination_status === "publishing" ||
    asset.status === "pending_review";

  const handlePrimary = () => {
    if (primaryDisabled) return;
    if (needsApproval) return onSendToApproval(asset.id);
    if (canRetry) return onRetry(asset.id);
    if (canQueuePublish) return onQueuePublish(asset.id);
    if (isApproved && asset.destination === null) {
      setDestinationMenuOpen((open) => !open);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6 pb-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded-md p-1.5 text-ink-400 hover:bg-canvas-hover hover:text-ink-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="truncate text-lg font-semibold text-ink-100">{title}</h1>
          <button
            type="button"
            aria-label="Edit title"
            className="rounded-md p-1.5 text-ink-500 hover:bg-canvas-hover hover:text-ink-100"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-canvas-input px-3 py-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-white">
              <Instagram className="h-3 w-3" />
            </div>
            <span className="text-xs font-medium text-ink-100">aurorabonita</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-500" />
          </div>
          <button
            type="button"
            aria-label="More"
            className="rounded-md p-1.5 text-ink-500 hover:bg-canvas-hover hover:text-ink-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-line-soft bg-canvas-card p-4">
        <ProgressStepper status={asset.status} failed={isFailed} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-xl border border-line-soft bg-canvas-card">
            {asset.media_url && asset.media_type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.media_url}
                alt="Post preview"
                className="aspect-square w-full object-cover"
              />
            ) : asset.media_url && asset.media_type === "video" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={asset.media_url}
                className="aspect-square w-full object-cover"
                controls
                preload="metadata"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-canvas-input text-ink-500">
                <Video className="h-10 w-10" />
              </div>
            )}
            <div className="absolute right-2 top-2 flex gap-1.5">
              <button
                type="button"
                aria-label="Expand"
                className="rounded-md bg-canvas-base/80 p-1.5 text-ink-300 backdrop-blur hover:text-ink-100"
              >
                <Expand className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="More"
                className="rounded-md bg-canvas-base/80 p-1.5 text-ink-300 backdrop-blur hover:text-ink-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          <MediaThumbnails
            activeId={asset.id}
            thumbnails={thumbnails}
            disabled={isLocked}
            onUpload={(file) => onUploadMedia(asset.id, file)}
          />
        </div>

        <div className="flex flex-col gap-4">
          <CaptionEditor
            value={asset.output}
            disabled={isLocked}
            onSave={(value) => onEditCaption(asset.id, value)}
          />
          <MediaDetails fileName={fileName} fileSize={asset.media_url ? mediaSizeLabel() : "—"} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onRegenerateImage(asset.id)}
              disabled={isLocked || pending}
              className="inline-flex items-center gap-2 rounded-lg border border-line-soft bg-transparent px-3 py-2 text-sm text-ink-300 hover:bg-canvas-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {pending ? "Regenerating…" : "Regenerate Image"}
            </button>
            <UploadOwnButton
              disabled={isLocked || pending}
              onUpload={(file) => onUploadMedia(asset.id, file)}
            />
            <button
              type="button"
              aria-label="More actions"
              className="rounded-lg border border-line-soft p-2 text-ink-400 hover:bg-canvas-hover hover:text-ink-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="flex overflow-hidden rounded-xl bg-accent-primary">
          <button
            type="button"
            onClick={handlePrimary}
            disabled={primaryDisabled}
            className="flex-1 py-3 text-sm font-semibold text-white hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-80"
          >
            {primaryLabel}
          </button>
          {isApproved && asset.destination === null ? (
            <button
              type="button"
              onClick={() => setDestinationMenuOpen((open) => !open)}
              disabled={pending}
              aria-label="Open destination menu"
              aria-expanded={destinationMenuOpen}
              className="flex items-center justify-center border-l border-white/20 px-4 text-white hover:bg-accent-primary/80"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {destinationMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-lg border border-line-soft bg-canvas-card shadow-xl"
          >
            {DESTINATIONS.map((destination) => (
              <button
                key={destination}
                type="button"
                role="menuitem"
                onClick={() => {
                  setDestinationMenuOpen(false);
                  onAssignDestination(asset.id, destination);
                }}
                className="block w-full px-3 py-2 text-left text-sm capitalize text-ink-100 hover:bg-canvas-hover"
              >
                {destination}
              </button>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-ink-500">
          {isLocked
            ? "Content is locked. Editing is disabled past this step."
            : "This content will be locked for editing once sent for approval."}
        </p>
      </div>
    </div>
  );
}

function UploadOwnButton({
  disabled,
  onUpload
}: {
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-soft px-3 py-2 text-sm text-ink-300 hover:bg-canvas-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-60">
      <Upload className="h-4 w-4" />
      <span>Upload Your Own</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </label>
  );
}
