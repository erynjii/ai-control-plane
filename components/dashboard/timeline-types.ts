// Classifies raw audit_events rows into two groups — lifecycle (publish
// flow, existing behavior) and pipeline (agent steps). Pure; lives next to
// activity-timeline.tsx so the grouping logic stays colocated with the
// component.
//
// Pipeline events are grouped by runId (pipeline_runs.id), not assetId, so
// a regenerated asset produces separate Generation blocks per run. For
// backward compatibility with events emitted before the runId field landed,
// events without runId fall back to grouping by assetId.

import { isPipelineAuditAction, type PipelineAuditAction } from "@/lib/agents/audit";
import type { AgentName, FlagSeverity } from "@/lib/agents/types";
import type { AuditEvent } from "@/lib/types";

const LIFECYCLE_ACTIONS = [
  "destination_assigned",
  "queued",
  "publish_started",
  "publish_succeeded",
  "publish_failed",
  "retry_triggered"
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export function isLifecycleAction(value: string): value is LifecycleAction {
  return (LIFECYCLE_ACTIONS as readonly string[]).includes(value);
}

/** Compact shape we expect on audit_events.metadata for pipeline events.
 *  Narrowed from unknown jsonb at render time. runId is optional on read
 *  for backward compatibility with events emitted before 1:N landed. */
export interface ParsedPipelineMetadata {
  agent: AgentName;
  durationMs: number;
  model: string;
  costUsd: number;
  summary: string;
  runId?: string;
}

const KNOWN_AGENTS: readonly AgentName[] = [
  "strategy",
  "copy",
  "brand",
  "photo",
  "compliance"
];

/** Narrow an audit_events.metadata jsonb blob into the PipelineAuditPayload
 *  shape. Returns null if anything doesn't match — caller should skip
 *  rendering rather than crash on a malformed row. */
export function parsePipelineMetadata(metadata: unknown): ParsedPipelineMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const agent = m.agent;
  if (typeof agent !== "string" || !(KNOWN_AGENTS as readonly string[]).includes(agent)) {
    return null;
  }
  const durationMs = m.durationMs;
  const model = m.model;
  const costUsd = m.costUsd;
  const summary = m.summary;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return null;
  if (typeof model !== "string") return null;
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) return null;
  if (typeof summary !== "string") return null;

  const runIdRaw = m.runId;
  const runId = typeof runIdRaw === "string" && runIdRaw.length > 0 ? runIdRaw : undefined;

  return {
    agent: agent as AgentName,
    durationMs,
    model,
    costUsd,
    summary,
    ...(runId ? { runId } : {})
  };
}

export type PipelineTimelineEvent = {
  kind: "pipeline";
  id: string;
  assetId: string;
  action: PipelineAuditAction | "pipeline.strategy_overridden";
  createdAt: string;
  payload: ParsedPipelineMetadata;
};

export type LifecycleTimelineEvent = {
  kind: "lifecycle";
  id: string;
  assetId: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type ClassifiedTimelineEvent = PipelineTimelineEvent | LifecycleTimelineEvent;

/** Accepts `pipeline.strategy_overridden` as a pipeline action even though
 *  it isn't in the core PIPELINE_AUDIT_ACTIONS tuple (added in a later
 *  commit). The classifier treats it as a pipeline event so the Generation
 *  block picks it up. */
function isOverrideAction(value: string): boolean {
  return value === "pipeline.strategy_overridden";
}

/** Turn raw AuditEvent rows into classified timeline events. Unknown/unparseable
 *  pipeline events degrade to lifecycle rendering so the timeline always stays
 *  up — we don't want a malformed metadata row to break the UI. */
export function classifyAuditEvent(event: AuditEvent): ClassifiedTimelineEvent {
  if (isPipelineAuditAction(event.action) || isOverrideAction(event.action)) {
    const payload = parsePipelineMetadata(event.metadata);
    if (payload) {
      return {
        kind: "pipeline",
        id: event.id,
        assetId: event.asset_id,
        action: event.action as PipelineAuditAction | "pipeline.strategy_overridden",
        createdAt: event.created_at,
        payload
      };
    }
  }
  return {
    kind: "lifecycle",
    id: event.id,
    assetId: event.asset_id,
    action: event.action,
    metadata: event.metadata ?? {},
    createdAt: event.created_at
  };
}

export interface GeneratedGroup {
  /** Primary key for the group. runId when present, otherwise assetId. */
  groupKey: string;
  /** pipeline_runs.id when this group came from runId-tagged events; null
   *  when falling back to assetId grouping. */
  runId: string | null;
  assetId: string;
  events: PipelineTimelineEvent[];
  totalCostUsd: number;
  /** Human-readable label derived from which agents produced events in
   *  this run. See buildGenerationLabel for the classification. */
  label: string;
}

export interface TimelineView {
  pipelineGroups: GeneratedGroup[];
  lifecycle: LifecycleTimelineEvent[];
}

/**
 * Derive a label for a Generation group from the agents whose events
 * appear in it, plus the presence of a strategy-override event.
 *
 *   All 5 core agents present         → "Initial generation"
 *   pipeline.strategy_overridden      → "Brief adjusted"
 *   copy present, photo absent        → "Regenerated caption"
 *   photo present, copy + brand absent → "Regenerated image"
 *   anything else                     → "Regeneration"
 *
 * Pure over the events array. UI can append a timestamp / user attribution.
 */
export function buildGenerationLabel(events: PipelineTimelineEvent[]): string {
  const agents = new Set(events.map((e) => e.payload.agent));
  const hasOverride = events.some((e) => e.action === "pipeline.strategy_overridden");

  if (hasOverride) return "Brief adjusted";
  if (
    agents.has("strategy") &&
    agents.has("copy") &&
    agents.has("photo") &&
    agents.has("brand") &&
    agents.has("compliance")
  ) {
    return "Initial generation";
  }
  if (agents.has("copy") && !agents.has("photo")) return "Regenerated caption";
  if (agents.has("photo") && !agents.has("copy") && !agents.has("brand")) {
    return "Regenerated image";
  }
  return "Regeneration";
}

/** Group pipeline events by runId (or assetId for events predating the
 *  runId field). Lifecycle events stay a flat list — the existing render
 *  path. */
export function buildTimelineView(events: AuditEvent[]): TimelineView {
  const classified = events.map(classifyAuditEvent);
  const groups = new Map<string, PipelineTimelineEvent[]>();
  const lifecycle: LifecycleTimelineEvent[] = [];

  for (const entry of classified) {
    if (entry.kind === "pipeline") {
      const key = entry.payload.runId ?? entry.assetId;
      const current = groups.get(key);
      if (current) current.push(entry);
      else groups.set(key, [entry]);
    } else {
      lifecycle.push(entry);
    }
  }

  const pipelineGroups: GeneratedGroup[] = Array.from(groups.entries()).map(([groupKey, assetEvents]) => {
    // Oldest → newest within the group (events come in newest-first from the API).
    const sorted = [...assetEvents].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
    const totalCostUsd = sorted.reduce((acc, event) => acc + event.payload.costUsd, 0);
    const runId = sorted[0]?.payload.runId ?? null;
    const assetId = sorted[0]?.assetId ?? "";
    return {
      groupKey,
      runId,
      assetId,
      events: sorted,
      totalCostUsd,
      label: buildGenerationLabel(sorted)
    };
  });

  // Newest group first when there's more than one (a regenerated asset
  // should list the most recent run at the top of the Generation stack).
  pipelineGroups.sort((a, b) => {
    const aTime = a.events[a.events.length - 1]?.createdAt ?? "";
    const bTime = b.events[b.events.length - 1]?.createdAt ?? "";
    return Date.parse(bTime) - Date.parse(aTime);
  });

  return { pipelineGroups, lifecycle };
}

/** Severity ordering for any future sort helpers — unused here but exported
 *  so consumers don't re-derive it. */
export const SEVERITY_RANK: Record<FlagSeverity, number> = { note: 1, warning: 2, blocker: 3 };
