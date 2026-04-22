"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentFlag, FlagSeverity } from "@/lib/agents/types";
import { RiskBadge } from "./risk-badge";

// Clickable severity pill on the approval card.
//
// v2 cards (have a pipelineRun): pill drives its color + label from
//   pipelineRun.max_flag_severity (blocker | warning | note | null).
//   Clicking expands an inline panel of the flags, blockers first.
// v1 cards (no pipelineRun): falls back to the existing scan-derived
//   RiskBadge; not clickable.
//
// TODO(pr4-or-followup): merge scan_findings severity + agent flag
// severity with source labels. The expanded panel would then show both
// with a "scan"/"agent" badge per row, and the pill would take the max
// of both. Not scoped here.

const SEVERITY_RANK: Record<FlagSeverity, number> = { note: 1, warning: 2, blocker: 3 };

const PILL_STYLES: Record<FlagSeverity | "clean", string> = {
  blocker: "border-signal-danger/40 bg-signal-danger/15 text-signal-danger",
  warning: "border-signal-warning/40 bg-signal-warning/15 text-signal-warning",
  note: "border-ink-500/40 bg-ink-500/10 text-ink-300",
  clean: "border-signal-success/40 bg-signal-success/15 text-signal-success"
};

const PILL_LABEL: Record<FlagSeverity | "clean", string> = {
  blocker: "BLOCKER",
  warning: "WARNING",
  note: "NOTE",
  clean: "CLEAN"
};

const DOT_COLOR: Record<FlagSeverity, string> = {
  blocker: "bg-signal-danger",
  warning: "bg-signal-warning",
  note: "bg-ink-500"
};

const AGENT_LABEL: Record<string, string> = {
  strategy: "Strategy",
  copy: "Copy",
  photo: "Photo",
  brand: "Brand",
  compliance: "Compliance"
};

type Tier = FlagSeverity | "clean";

export interface ApprovalCardPillProps {
  /** Scan-derived risk level — used as fallback for v1 cards. */
  riskLevel: string;
  /** Pipeline-run max flag severity (column pre-aggregated in PR 1). */
  maxFlagSeverity: FlagSeverity | null;
  /** Full flag list from pipelineRun.context.flags. */
  flags?: AgentFlag[];
  /** True when the asset has no pipelineRun (v1 post). */
  v1Fallback: boolean;
}

function sortFlags(flags: AgentFlag[]): AgentFlag[] {
  return [...flags].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

export function ApprovalCardPill({ riskLevel, maxFlagSeverity, flags, v1Fallback }: ApprovalCardPillProps) {
  const [open, setOpen] = useState(false);

  if (v1Fallback) {
    // No pipeline run — render the existing scan pill, non-clickable.
    return <RiskBadge risk={riskLevel} />;
  }

  const tier: Tier = maxFlagSeverity ?? "clean";
  const sorted = flags ? sortFlags(flags) : [];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide flag details" : "Show flag details"}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${PILL_STYLES[tier]} hover:brightness-110`}
      >
        <Chevron className="h-3 w-3" />
        {PILL_LABEL[tier]}
        {sorted.length > 0 ? (
          <span className="ml-1 opacity-80">·&nbsp;{sorted.length}</span>
        ) : null}
      </button>
      {open && sorted.length > 0 ? (
        <ul className="w-full max-w-sm space-y-1.5 rounded-md border border-line-soft bg-canvas-input/40 p-2">
          {sorted.map((flag, idx) => (
            <li key={`${flag.agent}-${flag.code}-${idx}`} className="flex items-start gap-2">
              <span
                aria-hidden
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLOR[flag.severity]}`}
              />
              <div className="min-w-0">
                <p className="text-[10px] leading-snug">
                  <span className="font-semibold text-ink-200">
                    {AGENT_LABEL[flag.agent] ?? flag.agent}
                  </span>
                  <span className="ml-1.5 rounded bg-canvas-base/60 px-1 py-0.5 font-mono text-[9px] text-ink-400">
                    {flag.code}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-ink-100">{flag.message}</p>
                {flag.suggestion ? (
                  <p className="mt-0.5 text-[10px] italic text-ink-400">
                    Suggestion: {flag.suggestion}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : open && sorted.length === 0 ? (
        <p className="text-[10px] text-ink-500">No flags to show.</p>
      ) : null}
    </div>
  );
}
