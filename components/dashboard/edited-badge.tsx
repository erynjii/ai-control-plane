"use client";

import { Pencil } from "lucide-react";

// Tiny pill that appears on approved cards that accumulated manager_edits
// before approval. Data comes from useApprovalCardData's `edits.count`.
// PR 4 adds a diff viewer behind this badge; for PR 3 it's informational.

export interface EditedBadgeProps {
  count: number;
}

export function EditedBadge({ count }: EditedBadgeProps) {
  if (count <= 0) return null;
  const label = count === 1 ? "edited" : `edited ×${count}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-cyan"
      title={`Manager made ${count} edit${count === 1 ? "" : "s"} before approval.`}
    >
      <Pencil className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
