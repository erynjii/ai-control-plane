"use client";

import { MoreHorizontal } from "lucide-react";

type UserProfileProps = {
  email: string | null;
  onLogout?: () => void;
};

function deriveName(email: string | null): { display: string; initial: string } {
  if (!email) return { display: "Signed in", initial: "•" };
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  const display = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || local;
  const initial = display.charAt(0).toUpperCase() || "•";
  return { display, initial };
}

export function UserProfile({ email, onLogout }: UserProfileProps) {
  const { display, initial } = deriveName(email);

  return (
    <div className="flex items-center gap-2.5 border-t border-line-soft px-4 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 text-xs font-bold text-white">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-100">{display}</p>
        <p className="truncate text-xs text-ink-500">{email ?? "—"}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Sign out"
        className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-canvas-hover hover:text-ink-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
