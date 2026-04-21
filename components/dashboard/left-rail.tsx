"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation } from "@/lib/types";

export type NavItem = {
  label: string;
  targetId?: string;
};

type LeftRailProps = {
  navItems: NavItem[];
  activeConversationId: string | null;
  conversationsRefreshKey?: number;
  onSelectConversation: (id: string | null) => void;
  onNewChat: () => void;
  onClose?: () => void;
};

export function LeftRail({
  navItems,
  activeConversationId,
  conversationsRefreshKey = 0,
  onSelectConversation,
  onNewChat,
  onClose
}: LeftRailProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [activeNav, setActiveNav] = useState<string | null>(navItems[0]?.targetId ?? null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/conversations");
      const payload = (await response.json().catch(() => null)) as
        | { conversations?: Conversation[] }
        | null;
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setConversations(payload?.conversations ?? []);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, conversationsRefreshKey]);

  const handleNavClick = (item: NavItem) => {
    if (!item.targetId) return;
    setActiveNav(item.targetId);
    if (typeof document !== "undefined") {
      document.getElementById(item.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onClose?.();
  };

  const handleConversationSelect = (id: string | null) => {
    onSelectConversation(id);
    onClose?.();
  };

  return (
    <aside className="flex w-full flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Navigation</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
            aria-label="Close navigation"
          >
            Close
          </button>
        ) : null}
      </div>

      <nav aria-label="Dashboard sections">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = Boolean(item.targetId && item.targetId === activeNav);
            const isDisabled = !item.targetId;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => handleNavClick(item)}
                  disabled={isDisabled}
                  aria-current={isActive ? "page" : undefined}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    isDisabled
                      ? "cursor-not-allowed text-slate-600"
                      : isActive
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  {item.label}
                  {isDisabled ? <span className="ml-2 text-[10px] uppercase text-slate-600">soon</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-800 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Conversations</p>
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose?.();
            }}
            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
          >
            + New
          </button>
        </div>
        {status === "error" ? (
          <p className="text-xs text-rose-300">Failed to load conversations.</p>
        ) : null}
        {status === "success" && conversations.length === 0 ? (
          <p className="text-xs text-slate-500">No conversations yet.</p>
        ) : null}
        <ul className="max-h-64 space-y-1 overflow-auto">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => handleConversationSelect(conversation.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-xs transition ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
