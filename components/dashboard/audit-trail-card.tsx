"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";

type Status = "idle" | "loading" | "success" | "error";

type AuditTrailCardProps = {
  refreshKey?: number;
};

const ACTION_LABELS: Record<string, string> = {
  destination_assigned: "Destination assigned",
  queued: "Queued",
  publish_started: "Publishing",
  publish_succeeded: "Published",
  publish_failed: "Publish failed",
  retry_triggered: "Retry triggered"
};

const ACTION_TONE: Record<string, string> = {
  destination_assigned: "text-slate-200",
  queued: "text-amber-200",
  publish_started: "text-cyan-200",
  publish_succeeded: "text-emerald-200",
  publish_failed: "text-rose-200",
  retry_triggered: "text-amber-200"
};

function getDestinationFromMetadata(metadata: Record<string, unknown>): string | null {
  const destination = metadata.destination;
  return typeof destination === "string" ? destination : null;
}

function getReasonFromMetadata(metadata: Record<string, unknown>): string | null {
  const reason = metadata.reason;
  return typeof reason === "string" ? reason : null;
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
        const label = ACTION_LABELS[event.action] ?? event.action;
        const tone = ACTION_TONE[event.action] ?? "text-slate-200";
        const destination = getDestinationFromMetadata(event.metadata);
        const reason = getReasonFromMetadata(event.metadata);
        return (
          <li key={event.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${tone}`}>{label}</span>
              {destination ? (
                <span className="rounded-md border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-300">
                  {destination}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
            {reason ? <p className="mt-1 text-[10px] text-rose-300">{reason}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
