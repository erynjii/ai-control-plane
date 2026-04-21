"use client";

import { useMemo, useState } from "react";

type InstagramPreviewProps = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  caption: string;
  username?: string;
  loading?: boolean;
  size?: "full" | "compact" | "thumb";
};

const DEFAULT_USERNAME = "headspa_bar";
const CAPTION_TRUNCATE_CHARS = 140;

type CaptionSegment = { type: "text" | "hashtag"; value: string };

function segmentCaption(caption: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  const regex = /(#[\w]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(caption)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: caption.slice(lastIndex, match.index) });
    }
    segments.push({ type: "hashtag", value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < caption.length) {
    segments.push({ type: "text", value: caption.slice(lastIndex) });
  }

  return segments;
}

function Avatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-[11px] font-bold text-white">
      {initial}
    </div>
  );
}

function IconRow() {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-3 text-slate-200">
        <HeartIcon />
        <CommentIcon />
        <ShareIcon />
      </div>
      <SaveIcon />
    </div>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7-4.35-7-10a4 4 0 017-2.65A4 4 0 0119 11c0 5.65-7 10-7 10z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function PlayOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/70 text-white shadow-lg ring-1 ring-white/20">
        <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[1px]" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

function MediaSlot({
  imageUrl,
  videoUrl,
  loading
}: {
  imageUrl?: string | null;
  videoUrl?: string | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
          <span className="text-xs">Generating image…</span>
        </div>
      </div>
    );
  }

  if (videoUrl) {
    return (
      <div className="relative aspect-square w-full bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={videoUrl} className="h-full w-full object-cover" controls preload="metadata" />
        <PlayOverlay />
      </div>
    );
  }

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt="Instagram post preview"
        className="aspect-square w-full bg-slate-900 object-cover"
      />
    );
  }

  return (
    <div className="flex aspect-square w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
      No media
    </div>
  );
}

export function InstagramPreview({
  imageUrl,
  videoUrl,
  caption,
  username = DEFAULT_USERNAME,
  loading = false,
  size = "full"
}: InstagramPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const segments = useMemo(() => segmentCaption(caption ?? ""), [caption]);
  const needsTruncation = (caption ?? "").length > CAPTION_TRUNCATE_CHARS;
  const visibleCaption = !needsTruncation || expanded ? caption : caption.slice(0, CAPTION_TRUNCATE_CHARS).trimEnd();
  const visibleSegments = useMemo(() => segmentCaption(visibleCaption ?? ""), [visibleCaption]);

  if (size === "thumb") {
    return (
      <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
        <MediaSlot imageUrl={imageUrl} videoUrl={videoUrl} loading={loading} />
      </div>
    );
  }

  const rootWidth = size === "compact" ? "max-w-[320px]" : "max-w-[420px]";

  return (
    <div className={`w-full ${rootWidth} overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-100 shadow-sm`}>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar username={username} />
          <div className="leading-tight">
            <p className="text-xs font-semibold text-slate-100">{username}</p>
            <p className="text-[10px] text-slate-500">Sponsored · Miami, FL</p>
          </div>
        </div>
        <button type="button" aria-label="More" className="text-slate-400 hover:text-slate-200">
          <MoreIcon />
        </button>
      </div>

      <MediaSlot imageUrl={imageUrl} videoUrl={videoUrl} loading={loading} />

      <IconRow />

      <div className="space-y-1 px-3 pb-3">
        <p className="text-xs text-slate-200">
          <span className="font-semibold text-slate-100">{username}</span>{" "}
          {(needsTruncation && !expanded ? visibleSegments : segments).map((segment, index) =>
            segment.type === "hashtag" ? (
              <span key={index} className="text-sky-400">
                {segment.value}
              </span>
            ) : (
              <span key={index}>{segment.value}</span>
            )
          )}
          {needsTruncation && !expanded ? (
            <>
              {"… "}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-slate-500 hover:text-slate-300"
              >
                more
              </button>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
