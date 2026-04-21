"use client";

import { ChevronDown } from "lucide-react";

type WorkspaceSelectorProps = {
  name?: string;
  initial?: string;
};

export function WorkspaceSelector({ name = "Aurora Bonita", initial = "A" }: WorkspaceSelectorProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-lg border border-line-soft bg-canvas-input px-3 py-2.5 text-left hover:bg-canvas-hover"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-[11px] font-bold text-white">
        {initial}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-100">{name}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" />
    </button>
  );
}
