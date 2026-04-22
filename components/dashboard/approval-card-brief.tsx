"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { StrategyBrief } from "@/lib/agents/types";

// Compact one-liner under the caption showing "Audience · Tone · CTA"
// for v2 cards that have a StrategyBrief. Clicking expands the full
// brief inline. Hidden when brief is missing (v1 cards).

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export interface ApprovalCardBriefProps {
  brief: StrategyBrief | undefined;
}

export function ApprovalCardBrief({ brief }: ApprovalCardBriefProps) {
  const [open, setOpen] = useState(false);

  if (!brief) return null;

  const summary = `Audience: ${truncate(brief.audience, 30)} · Tone: ${truncate(
    brief.tone,
    24
  )} · CTA: ${truncate(brief.cta.text, 28)}`;

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-xs text-ink-400 hover:text-ink-200"
      >
        <Chevron className="mt-0.5 h-3 w-3 shrink-0" />
        <span className="min-w-0">{summary}</span>
      </button>
      {open ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-line-soft bg-canvas-input/40 p-2 text-xs">
          <dt className="text-ink-500">Audience</dt>
          <dd className="text-ink-100">{brief.audience}</dd>
          <dt className="text-ink-500">Tone</dt>
          <dd className="text-ink-100">{brief.tone}</dd>
          <dt className="text-ink-500">Content pillar</dt>
          <dd className="text-ink-100">{brief.contentPillar}</dd>
          <dt className="text-ink-500">CTA</dt>
          <dd className="text-ink-100">
            {brief.cta.text}
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-500">
              ({brief.cta.type})
            </span>
          </dd>
          <dt className="text-ink-500">Visual concept</dt>
          <dd className="text-ink-100">{brief.visualConcept}</dd>
          {brief.hashtagClusters.length > 0 ? (
            <>
              <dt className="text-ink-500">Hashtags</dt>
              <dd className="flex flex-wrap gap-1">
                {brief.hashtagClusters.map((cluster) => (
                  <span
                    key={cluster}
                    className="rounded-full border border-line-soft bg-canvas-base/40 px-2 py-0.5 text-[10px] text-ink-200"
                  >
                    {cluster}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          {brief.optimalPostTime ? (
            <>
              <dt className="text-ink-500">Best time</dt>
              <dd className="text-ink-100">{brief.optimalPostTime}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
