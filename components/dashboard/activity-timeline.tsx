"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";

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

function describe(event: AuditEvent): { label: string; actor: string } {
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toneFor(action: string): string {
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

export function ActivityTimeline({ refreshKey = 0 }: ActivityTimelineProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/audit-events?limit=8");
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

      {events.length > 0 ? (
        <ol className="relative space-y-4 pl-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-line-soft">
          {events.map((event) => {
            const { label, actor } = describe(event);
            return (
              <li key={event.id} className="relative">
                <span
                  aria-hidden
                  className={`absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-canvas-card ${toneFor(event.action)}`}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs leading-snug text-ink-100">{label}</p>
                    <p className="mt-0.5 text-[10px] text-ink-500">{actor}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-ink-500">{formatTime(event.created_at)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
