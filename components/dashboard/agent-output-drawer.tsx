"use client";

import { useEffect, useState } from "react";
import { Camera, PenTool, Shield, ShieldCheck, Sparkles, X, type LucideIcon } from "lucide-react";
import type {
  AgentFlag,
  AgentName,
  CaptionVariant,
  PipelineContext,
  StrategyBrief
} from "@/lib/agents/types";
import type { PipelineTimelineEvent } from "./timeline-types";

type PipelineRunRow = {
  id: string;
  asset_id: string;
  total_cost_usd: number | string;
  duration_ms: number;
  max_flag_severity: string | null;
  context: PipelineContext;
  model_versions: Record<string, string>;
  created_at: string;
};

type PipelineRunsResponse = {
  pipelineRuns?: PipelineRunRow[];
  error?: string;
};

const AGENT_ICON: Record<AgentName, LucideIcon> = {
  strategy: Sparkles,
  copy: PenTool,
  photo: Camera,
  brand: Shield,
  compliance: ShieldCheck
};

const AGENT_LABEL: Record<AgentName, string> = {
  strategy: "Strategy",
  copy: "Copy",
  photo: "Photo",
  brand: "Brand",
  compliance: "Compliance"
};

const SEVERITY_PILL: Record<AgentFlag["severity"], string> = {
  blocker: "border-signal-danger/40 bg-signal-danger/15 text-signal-danger",
  warning: "border-signal-warning/40 bg-signal-warning/15 text-signal-warning",
  note: "border-ink-500/40 bg-ink-500/10 text-ink-300"
};

type DrawerProps = {
  event: PipelineTimelineEvent | null;
  onClose: () => void;
};

export function AgentOutputDrawer({ event, onClose }: DrawerProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [run, setRun] = useState<PipelineRunRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Escape closes the drawer.
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  // Fetch the full run whenever a new event is selected. When the event
  // carries a runId we narrow the query to that specific run; otherwise we
  // fall back to the newest run for the asset (same asset_id, one row —
  // matches pre-1:N behavior).
  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    setStatus("loading");
    setRun(null);
    setDetailsOpen(false);
    (async () => {
      try {
        const params = new URLSearchParams({ asset_id: event.assetId });
        const runId = event.payload.runId;
        if (runId) params.set("run_id", runId);
        const res = await fetch(`/api/pipeline-runs?${params.toString()}`);
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const payload = (await res.json()) as PipelineRunsResponse;
        if (cancelled) return;
        // Response is ordered desc → first entry is the newest / the matched run.
        const picked = payload.pipelineRuns?.[0] ?? null;
        setRun(picked);
        setStatus(picked ? "success" : "error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event]);

  if (!event) return null;

  const Icon = AGENT_ICON[event.payload.agent];
  const label = AGENT_LABEL[event.payload.agent];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${label} agent output`}>
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-canvas-base/70"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-canvas-card shadow-2xl border-l border-line-soft">
        <header className="flex items-start justify-between gap-2 border-b border-line-soft px-4 py-3">
          <div className="flex items-start gap-2 min-w-0">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-100">{label}</p>
              <p className="mt-0.5 text-[10px] text-ink-500">
                {event.payload.model} · {formatDuration(event.payload.durationMs)} · {formatCost(event.payload.costUsd)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-400 hover:bg-canvas-hover hover:text-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {status === "loading" ? (
            <p className="text-xs text-ink-500">Loading agent output…</p>
          ) : null}
          {status === "error" ? (
            <p className="text-xs text-signal-danger">Failed to load pipeline run for this asset.</p>
          ) : null}

          {status === "success" && run ? (
            <>
              <AgentOutputBody agent={event.payload.agent} context={run.context} />
              <div className="mt-6 border-t border-line-soft pt-3">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((open) => !open)}
                  aria-expanded={detailsOpen}
                  className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-500 hover:text-ink-300"
                >
                  {detailsOpen ? "Hide raw details" : "Show raw details"}
                </button>
                {detailsOpen ? (
                  <pre className="mt-2 max-h-[240px] overflow-auto rounded-lg border border-line-soft bg-canvas-input/40 p-3 text-[10px] text-ink-300">
                    {JSON.stringify(sliceContextForAgent(event.payload.agent, run.context), null, 2)}
                  </pre>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">{title}</p>
      <div className="text-xs text-ink-100">{children}</div>
    </section>
  );
}

function AgentOutputBody({ agent, context }: { agent: AgentName; context: PipelineContext }) {
  switch (agent) {
    case "strategy":
      return <StrategyBody brief={context.brief} />;
    case "copy":
      return <CopyBody variants={context.variants ?? []} />;
    case "brand":
      return <BrandBody variants={context.variants ?? []} />;
    case "photo":
      return <PhotoBody imageUrl={context.imageUrl} imagePrompt={context.imagePrompt} />;
    case "compliance":
      return <ComplianceBody flags={context.flags ?? []} />;
    default:
      return <p className="text-xs text-ink-500">No output to show.</p>;
  }
}

function StrategyBody({ brief }: { brief: StrategyBrief | undefined }) {
  if (!brief) return <p className="text-xs text-ink-500">No brief produced.</p>;
  return (
    <>
      <Section title="Audience">{brief.audience}</Section>
      <Section title="Tone">{brief.tone}</Section>
      <Section title="Content pillar">{brief.contentPillar}</Section>
      <Section title="Call to action">
        <span className="text-ink-100">{brief.cta.text}</span>
        <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-500">({brief.cta.type})</span>
      </Section>
      <Section title="Visual concept">{brief.visualConcept}</Section>
      {brief.hashtagClusters.length > 0 ? (
        <Section title="Hashtag clusters">
          <ul className="flex flex-wrap gap-1.5">
            {brief.hashtagClusters.map((cluster) => (
              <li
                key={cluster}
                className="rounded-full border border-line-soft bg-canvas-input/40 px-2 py-0.5 text-[11px] text-ink-200"
              >
                {cluster}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function CopyBody({ variants }: { variants: CaptionVariant[] }) {
  if (variants.length === 0) return <p className="text-xs text-ink-500">No variants produced.</p>;
  return (
    <>
      {variants.map((variant, i) => (
        <Section key={variant.id} title={`Variant ${i + 1}`}>
          <p className="whitespace-pre-wrap leading-relaxed text-ink-100">{variant.text}</p>
          {variant.hashtags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1">
              {variant.hashtags.map((tag) => (
                <li key={tag} className="text-[11px] text-accent-cyan">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}
    </>
  );
}

function BrandBody({ variants }: { variants: CaptionVariant[] }) {
  if (variants.length === 0) return <p className="text-xs text-ink-500">No variants to score.</p>;
  return (
    <>
      {variants.map((variant, i) => (
        <Section key={variant.id} title={`Variant ${i + 1}`}>
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-semibold text-ink-100">{variant.brandScore ?? "—"}</span>
            <span className="text-[11px] uppercase tracking-wide text-ink-500">score</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-ink-400">{variant.text}</p>
          {variant.brandFlags && variant.brandFlags.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {variant.brandFlags.map((flag, idx) => (
                <FlagRow key={idx} flag={flag} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-ink-500">No flags.</p>
          )}
        </Section>
      ))}
    </>
  );
}

function PhotoBody({
  imageUrl,
  imagePrompt
}: {
  imageUrl: string | undefined;
  imagePrompt: string | undefined;
}) {
  return (
    <>
      {imageUrl ? (
        <Section title="Image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated post preview"
            className="aspect-square w-full rounded-lg border border-line-soft object-cover"
          />
        </Section>
      ) : (
        <Section title="Image">
          <span className="text-ink-500">No image produced.</span>
        </Section>
      )}
      {imagePrompt ? (
        <Section title="Image prompt">
          <p className="whitespace-pre-wrap leading-relaxed text-ink-100">{imagePrompt}</p>
        </Section>
      ) : null}
    </>
  );
}

function ComplianceBody({ flags }: { flags: AgentFlag[] }) {
  const complianceFlags = flags.filter((f) => f.agent === "compliance");
  if (complianceFlags.length === 0) {
    return <p className="text-xs text-signal-success">Clean — no compliance flags raised.</p>;
  }
  return (
    <ul className="space-y-2">
      {complianceFlags.map((flag, idx) => (
        <FlagRow key={idx} flag={flag} />
      ))}
    </ul>
  );
}

function FlagRow({ flag }: { flag: AgentFlag }) {
  const pill = SEVERITY_PILL[flag.severity];
  return (
    <li className="rounded-md border border-line-soft bg-canvas-input/40 p-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${pill}`}>
          {flag.severity}
        </span>
        <span className="font-mono text-[10px] text-ink-500">{flag.code}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-ink-100">{flag.message}</p>
      {flag.suggestion ? (
        <p className="mt-1 text-[11px] italic text-ink-400">Suggestion: {flag.suggestion}</p>
      ) : null}
    </li>
  );
}

function sliceContextForAgent(agent: AgentName, context: PipelineContext): unknown {
  switch (agent) {
    case "strategy":
      return context.brief ?? null;
    case "copy":
      return context.variants?.map((v) => ({ id: v.id, text: v.text, hashtags: v.hashtags })) ?? [];
    case "brand":
      return context.variants?.map((v) => ({
        id: v.id,
        brandScore: v.brandScore,
        brandFlags: v.brandFlags
      })) ?? [];
    case "photo":
      return { imageUrl: context.imageUrl, imagePrompt: context.imagePrompt };
    case "compliance":
      return context.flags.filter((f) => f.agent === "compliance");
    default:
      return null;
  }
}
