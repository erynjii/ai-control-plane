"use client";

import { ChangeEvent, useRef } from "react";
import { Plus, Video } from "lucide-react";

export type MediaThumbnail = {
  id: string;
  url: string;
  type: "image" | "video";
};

type MediaThumbnailsProps = {
  activeId: string | null;
  thumbnails: MediaThumbnail[];
  disabled?: boolean;
  onSelect?: (id: string) => void;
  onUpload?: (file: File) => void;
};

export function MediaThumbnails({
  activeId,
  thumbnails,
  disabled = false,
  onSelect,
  onUpload
}: MediaThumbnailsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && onUpload) onUpload(file);
  };

  return (
    <div className="flex items-center gap-2">
      {thumbnails.map((thumb) => {
        const isActive = thumb.id === activeId;
        return (
          <button
            key={thumb.id}
            type="button"
            onClick={() => onSelect?.(thumb.id)}
            className={`h-14 w-14 overflow-hidden rounded-lg border ${
              isActive ? "border-accent-cyan" : "border-line-soft"
            } hover:border-accent-cyan/60`}
          >
            {thumb.type === "video" ? (
              <div className="flex h-full w-full items-center justify-center bg-canvas-input text-ink-400">
                <Video className="h-5 w-5" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb.url} alt="" className="h-full w-full object-cover" />
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-400 hover:border-accent-cyan hover:text-accent-cyan disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Add media"
      >
        <Plus className="h-5 w-5" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
