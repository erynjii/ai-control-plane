"use client";

import { Pencil } from "lucide-react";

// Tiny pill that appears on approved cards that accumulated manager_edits
// before approval. Data comes from useApprovalCardData's `edits.count`.
//
// PR 4: when `onClick` is passed, the badge becomes a real <button> that
// opens the diff viewer. Without it, the badge renders as a plain <span>
// (unchanged behavior from PR 3) so anywhere the drawer wiring isn't in
// place yet keeps working.

export interface EditedBadgeProps {
  count: number;
  onClick?: () => void;
}

export function EditedBadge({ count, onClick }: EditedBadgeProps) {
  if (count <= 0) return null;
  const label = count === 1 ? "edited" : `edited ×${count}`;
  const title = `Manager made ${count} edit${count === 1 ? "" : "s"} before approval.`;
  const className =
    "inline-flex items-center gap-1 rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-cyan";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${title} Click to view diff.`}
        aria-label={`${title} Click to view diff.`}
        className={`${className} cursor-pointer hover:bg-accent-cyan/20`}
      >
        <Pencil className="h-2.5 w-2.5" />
        {label}
      </button>
    );
  }

  return (
    <span className={className} title={title}>
      <Pencil className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
