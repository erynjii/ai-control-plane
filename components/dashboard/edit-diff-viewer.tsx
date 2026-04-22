"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { computeLineDiff, type DiffOp } from "@/lib/diff/line-diff";

type FullEdit = {
  id: string;
  field: string;
  before: string;
  after: string;
  editedAt: string;
};

type EditsFullResponse = {
  count: number;
  latest: { field: string; editedAt: string } | null;
  edits?: FullEdit[];
  error?: string;
};

type DrawerStatus = "idle" | "loading" | "success" | "empty" | "error";

type EditDiffViewerProps = {
  /** null/undefined closes the drawer. */
  assetId: string | null;
  onClose: () => void;
};

export function EditDiffViewer({ assetId, onClose }: EditDiffViewerProps) {
  const [status, setStatus] = useState<DrawerStatus>("idle");
  const [edits, setEdits] = useState<FullEdit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Escape closes the drawer.
  useEffect(() => {
    if (!assetId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assetId, onClose]);

  // Fetch edits when assetId changes (and is non-null).
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setStatus("loading");
    setEdits([]);
    setSelectedId(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/assets/${encodeURIComponent(assetId)}/edits?include=full`
        );
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const payload = (await res.json()) as EditsFullResponse;
        if (cancelled) return;
        const rows = payload.edits ?? [];
        if (rows.length === 0) {
          setStatus("empty");
          return;
        }
        setEdits(rows);
        setSelectedId(rows[0].id); // newest (API returns desc)
        setStatus("success");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (!assetId) return null;

  const selected = edits.find((e) => e.id === selectedId) ?? edits[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Manager edit history"
    >
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-canvas-base/70"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-line-soft bg-canvas-card shadow-2xl">
        <header className="flex items-start justify-between gap-2 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-100">Manager edits</p>
            <p className="mt-0.5 text-[10px] text-ink-500">
              {status === "success"
                ? `${edits.length} edit${edits.length === 1 ? "" : "s"} on this asset`
                : status === "empty"
                  ? "No edits recorded for this asset."
                  : "Diff of before → after"}
            </p>
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {status === "loading" ? (
            <p className="p-4 text-xs text-ink-500">Loading edit history…</p>
          ) : null}
          {status === "error" ? (
            <p className="p-4 text-xs text-signal-danger">Failed to load edits.</p>
          ) : null}
          {status === "empty" ? (
            <p className="p-4 text-xs text-ink-500">
              This asset has no manager edits — nothing to show.
            </p>
          ) : null}

          {status === "success" && selected ? (
            <>
              {edits.length > 1 ? (
                <nav
                  aria-label="Edit history"
                  className="border-b border-line-soft bg-canvas-input/40 px-2 py-2"
                >
                  <ul className="flex flex-wrap gap-1">
                    {edits.map((e, idx) => {
                      const active = e.id === selected.id;
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedId(e.id)}
                            className={`rounded-md border px-2 py-1 text-[10px] ${
                              active
                                ? "border-accent-cyan/40 bg-accent-cyan/10 text-ink-100"
                                : "border-line-soft bg-canvas-card text-ink-400 hover:text-ink-200"
                            }`}
                          >
                            #{edits.length - idx} · {formatRelative(e.editedAt)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              ) : null}

              <div className="p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  {selected.field}
                  <span className="ml-2 font-normal normal-case tracking-normal text-ink-400">
                    · {new Date(selected.editedAt).toLocaleString()}
                  </span>
                </p>
                <DiffView before={selected.before} after={selected.after} />
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const ops = computeLineDiff(before, after);
  if (ops.length === 0) {
    return <p className="text-xs text-ink-500">Before and after are both empty.</p>;
  }
  return (
    <ol
      aria-label="Unified diff"
      className="overflow-hidden rounded-md border border-line-soft bg-canvas-input/40 font-mono text-[11px]"
    >
      {ops.map((op, idx) => (
        <DiffLine key={idx} op={op} />
      ))}
    </ol>
  );
}

function DiffLine({ op }: { op: DiffOp }) {
  const { marker, rowClass, markerClass } = lineStyle(op.kind);
  return (
    <li className={`flex items-start gap-2 px-2 py-0.5 ${rowClass}`}>
      <span aria-hidden className={`w-3 shrink-0 text-right ${markerClass}`}>
        {marker}
      </span>
      <span className="whitespace-pre-wrap break-words text-ink-100">{op.text || " "}</span>
    </li>
  );
}

function lineStyle(kind: DiffOp["kind"]): {
  marker: string;
  rowClass: string;
  markerClass: string;
} {
  if (kind === "added") {
    return {
      marker: "+",
      rowClass: "bg-signal-success/10",
      markerClass: "text-signal-success"
    };
  }
  if (kind === "removed") {
    return {
      marker: "−",
      rowClass: "bg-signal-danger/10",
      markerClass: "text-signal-danger"
    };
  }
  return { marker: "", rowClass: "", markerClass: "text-ink-500" };
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
