// Classifies raw audit_events rows into two groups — lifecycle (publish
// flow, existing behavior) and pipeline (agent steps, new in PR 2). Pure;
// lives next to activity-timeline.tsx so the grouping logic stays
// colocated with the component.

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
 *  Narrowed from unknown jsonb at render time. */
export interface ParsedPipelineMetadata {
  agent: AgentName;
  durationMs: number;
  model: string;
  costUsd: number;
  summary: string;
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
  return {
    agent: agent as AgentName,
    durationMs,
    model,
    costUsd,
    summary
  };
}

export type PipelineTimelineEvent = {
  kind: "pipeline";
  id: string;
  assetId: string;
  action: PipelineAuditAction;
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

/** Turn raw AuditEvent rows into classified timeline events. Unknown/unparseable
 *  pipeline events degrade to lifecycle rendering so the timeline always stays
 *  up — we don't want a malformed metadata row to break the UI. */
export function classifyAuditEvent(event: AuditEvent): ClassifiedTimelineEvent {
  if (isPipelineAuditAction(event.action)) {
    const payload = parsePipelineMetadata(event.metadata);
    if (payload) {
      return {
        kind: "pipeline",
        id: event.id,
        assetId: event.asset_id,
        action: event.action,
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
    createdAt: event.created_at,
    metadata: event.metadata ?? {}
  };
}

export interface GeneratedGroup {
  assetId: string;
  events: PipelineTimelineEvent[];
  totalCostUsd: number;
}

export interface TimelineView {
  pipelineGroups: GeneratedGroup[];
  lifecycle: LifecycleTimelineEvent[];
}

/** Group pipeline events by asset_id, preserve their in-order sequence,
 *  and keep lifecycle events as a flat list — the existing render path. */
export function buildTimelineView(events: AuditEvent[]): TimelineView {
  const classified = events.map(classifyAuditEvent);
  const groups = new Map<string, PipelineTimelineEvent[]>();
  const lifecycle: LifecycleTimelineEvent[] = [];
  for (const entry of classified) {
    if (entry.kind === "pipeline") {
      const current = groups.get(entry.assetId);
      if (current) current.push(entry);
      else groups.set(entry.assetId, [entry]);
    } else {
      lifecycle.push(entry);
    }
  }
  const pipelineGroups: GeneratedGroup[] = Array.from(groups.entries()).map(
    ([assetId, assetEvents]) => {
      // Oldest → newest within the group (events come in newest-first from the API).
      const sorted = [...assetEvents].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
      );
      const totalCostUsd = sorted.reduce((acc, event) => acc + event.payload.costUsd, 0);
      return { assetId, events: sorted, totalCostUsd };
    }
  );
  return { pipelineGroups, lifecycle };
}

/** Severity ordering for any future sort helpers — unused here but exported
 *  so consumers don't re-derive it. */
export const SEVERITY_RANK: Record<FlagSeverity, number> = { note: 1, warning: 2, blocker: 3 };
