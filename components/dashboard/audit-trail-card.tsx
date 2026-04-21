"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

type AuditTrailCardProps = {
  refreshKey?: number;
};

const ACTION_TONE: Record<string, string> = {
  destination_assigned: "text-slate-200",
  queued: "text-amber-200",
  publish_started: "text-cyan-200",
  publish_succeeded: "text-emerald-200",
  publish_failed: "text-rose-200",
  retry_triggered: "text-amber-200"
};

function getString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describe(event: AuditEvent): string {
  const destination = getString(event.metadata, "destination");
  const destinationLabel = destination ? titleCase(destination) : null;
  switch (event.action) {
    case "destination_assigned":
      return destinationLabel
        ? `Destination assigned: ${destinationLabel}`
        : "Destination assigned";
    case "queued":
      return destinationLabel ? `Queued for ${destinationLabel}` : "Queued";
    case "publish_started":
      return destinationLabel ? `Publishing to ${destinationLabel}` : "Publishing";
    case "publish_succeeded":
      return destinationLabel ? `Published to ${destinationLabel}` : "Published";
    case "publish_failed": {
      const reason = getString(event.metadata, "reason");
      const base = destinationLabel ? `Publish failed (${destinationLabel})` : "Publish failed";
      return reason ? `${base}: ${reason}` : base;
    }
    case "retry_triggered":
      return destinationLabel ? `Retry triggered for ${destinationLabel}` : "Retry triggered";
    default:
      return event.action;
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1m ago";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuditTrailCard({ refreshKey = 0 }: AuditTrailCardProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/audit-events?limit=25");
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

  if (status === "error") {
    return <p className="text-sm text-rose-300">Failed to load audit trail.</p>;
  }
  if (status !== "success") {
    return <p className="text-xs text-slate-400">Loading...</p>;
  }
  if (events.length === 0) {
    return <p className="text-xs text-slate-400">No publishing activity yet.</p>;
  }

  return (
    <ul className="max-h-80 space-y-2 overflow-auto">
      {events.map((event) => {
        const tone = ACTION_TONE[event.action] ?? "text-slate-200";
        const description = describe(event);
        return (
          <li key={event.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className={`text-xs font-medium ${tone}`}>{description}</span>
              <span className="shrink-0 text-[10px] text-slate-500">{relativeTime(event.created_at)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
