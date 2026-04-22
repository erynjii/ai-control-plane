"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  PenTool,
  Shield,
  ShieldCheck,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type { AuditEvent } from "@/lib/types";
import type { AgentName } from "@/lib/agents/types";
import {
  buildTimelineView,
  type GeneratedGroup,
  type LifecycleTimelineEvent,
  type PipelineTimelineEvent
} from "./timeline-types";

type Status = "idle" | "loading" | "success" | "error";

type ActivityTimelineProps = {
  refreshKey?: number;
};

function getString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeLifecycle(event: LifecycleTimelineEvent): { label: string; actor: string } {
  const destination = getString(event.metadata, "destination");
  const dest = destination ? titleCase(destination) : null;
  switch (event.action) {
    case "destination_assigned":
      return { label: dest ? `Destination assigned — ${dest}` : "Destination assigned", actor: "by you" };
    case "queued":
      return { label: dest ? `Queued for ${dest}` : "Queued for publish", actor: "by system" };
    case "publish_started":
      return { label: dest ? `Publishing to ${dest}` : "Publishing", actor: "by system" };
    case "publish_succeeded":
      return { label: dest ? `Published to ${dest}` : "Published", actor: "by system" };
    case "publish_failed": {
      const reason = getString(event.metadata, "reason");
      const base = dest ? `Publish failed (${dest})` : "Publish failed";
      return { label: reason ? `${base}: ${reason}` : base, actor: "by system" };
    }
    case "retry_triggered":
      return { label: dest ? `Retry triggered — ${dest}` : "Retry triggered", actor: "by you" };
    default:
      return { label: event.action, actor: "by system" };
  }
}

function lifecycleTone(action: string): string {
  switch (action) {
    case "publish_succeeded":
      return "bg-signal-success";
    case "publish_failed":
      return "bg-signal-danger";
    case "queued":
    case "retry_triggered":
      return "bg-signal-warning";
    case "publish_started":
      return "bg-accent-cyan";
    default:
      return "bg-ink-500";
  }
}

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

function pipelineTone(event: PipelineTimelineEvent): string {
  if (event.payload.summary.startsWith("error:")) return "bg-signal-danger";
  if (event.payload.summary.startsWith("skipped")) return "bg-ink-500";
  if (event.payload.agent === "compliance" && /blocker/.test(event.payload.summary)) {
    return "bg-signal-danger";
  }
  if (/warning/.test(event.payload.summary)) return "bg-signal-warning";
  return "bg-accent-cyan";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

export function ActivityTimeline({ refreshKey = 0 }: ActivityTimelineProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/audit-events?limit=20");
      const payload = (await response.json().catch(() => null)) as { events?: AuditEvent[] } | null;
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setEvents(payload?.events ?? []);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const view = useMemo(() => buildTimelineView(events), [events]);

  const toggleGroup = (assetId: string) => {
    setCollapsedGroups((current) => ({ ...current, [assetId]: !current[assetId] }));
  };

  return (
    <section className="rounded-xl border border-line-soft bg-canvas-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-100">Recent Activity</h3>
        <button type="button" className="text-xs text-accent-cyan hover:underline">
          View all
        </button>
      </header>

      {status === "loading" ? <p className="text-xs text-ink-500">Loading…</p> : null}
      {status === "error" ? <p className="text-xs text-signal-danger">Failed to load.</p> : null}
      {status === "success" && events.length === 0 ? (
        <p className="text-xs text-ink-500">No activity yet.</p>
      ) : null}

      {view.pipelineGroups.length > 0 ? (
        <div className="mb-3 space-y-3">
          {view.pipelineGroups.map((group) => (
            <PipelineGroupBlock
              key={group.assetId}
              group={group}
              collapsed={collapsedGroups[group.assetId] ?? false}
              onToggle={() => toggleGroup(group.assetId)}
            />
          ))}
        </div>
      ) : null}

      {view.lifecycle.length > 0 ? (
        <LifecycleList events={view.lifecycle} />
      ) : null}
    </section>
  );
}

function PipelineGroupBlock({
  group,
  collapsed,
  onToggle
}: {
  group: GeneratedGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="rounded-lg border border-line-soft bg-canvas-input/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <Chevron className="h-3.5 w-3.5 text-ink-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
            Generation
          </span>
          <span className="text-[10px] text-ink-500">
            {group.events.length} step{group.events.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-xs font-medium text-ink-100">{formatCost(group.totalCostUsd)}</span>
      </button>
      {!collapsed ? (
        <ol className="relative space-y-3 px-3 pb-3 pl-7 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-line-soft">
          {group.events.map((event) => (
            <PipelineEventRow key={event.id} event={event} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function PipelineEventRow({ event }: { event: PipelineTimelineEvent }) {
  const Icon = AGENT_ICON[event.payload.agent];
  const tone = pipelineTone(event);
  const errored = event.payload.summary.startsWith("error:");
  return (
    <li className="relative">
      <span
        aria-hidden
        className={`absolute -left-[11px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-canvas-input ${tone}`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${errored ? "text-signal-danger" : "text-ink-300"}`} />
            <span className="text-xs font-medium text-ink-100">{AGENT_LABEL[event.payload.agent]}</span>
          </div>
          <p className={`mt-0.5 text-[11px] leading-snug ${errored ? "text-signal-danger" : "text-ink-300"}`}>
            {event.payload.summary}
          </p>
          <p className="mt-0.5 text-[10px] text-ink-500">
            {event.payload.model} · {formatCost(event.payload.costUsd)}
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-ink-500">{formatTime(event.createdAt)}</span>
      </div>
    </li>
  );
}

function LifecycleList({ events }: { events: LifecycleTimelineEvent[] }) {
  return (
    <ol className="relative space-y-4 pl-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-line-soft">
      {events.map((event) => {
        const { label, actor } = describeLifecycle(event);
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-canvas-card ${lifecycleTone(event.action)}`}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs leading-snug text-ink-100">{label}</p>
                <p className="mt-0.5 text-[10px] text-ink-500">{actor}</p>
              </div>
              <span className="shrink-0 text-[10px] text-ink-500">{formatTime(event.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
