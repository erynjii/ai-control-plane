"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CheckSquare,
  Clock,
  Instagram,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MessageSquare,
  Settings,
  Sparkles
} from "lucide-react";
import type { Conversation } from "@/lib/types";
import { WorkspaceSelector } from "@/components/dashboard/workspace-selector";
import { UserProfile } from "@/components/dashboard/user-profile";

export type NavKey = "workspace" | "approvals" | "assets" | "audit" | "insights" | "settings";

type LeftRailProps = {
  activeConversationId: string | null;
  activeNav: NavKey;
  conversationsRefreshKey?: number;
  approvalsCount?: number;
  userEmail: string | null;
  onSelectConversation: (id: string | null) => void;
  onSelectNav: (key: NavKey) => void;
  onNewChat: () => void;
  onLogout: () => void;
  onClose?: () => void;
};

type NavDef = {
  key: NavKey;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavDef[] = [
  { key: "workspace", label: "Workspace", icon: LayoutDashboard },
  { key: "approvals", label: "Approvals", icon: CheckSquare },
  { key: "assets", label: "Assets", icon: Layers },
  { key: "audit", label: "Audit Trail", icon: Clock },
  { key: "insights", label: "Insights", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings }
];

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString();
}

function conversationIcon(title: string): LucideIcon {
  const t = title.toLowerCase();
  if (t.includes("instagram") || t.includes("post")) return Instagram;
  if (t.includes("email") || t.includes("newsletter")) return Mail;
  return MessageSquare;
}

export function LeftRail({
  activeConversationId,
  activeNav,
  conversationsRefreshKey = 0,
  approvalsCount = 0,
  userEmail,
  onSelectConversation,
  onSelectNav,
  onNewChat,
  onLogout,
  onClose
}: LeftRailProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

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

  const handleConversationSelect = (id: string) => {
    onSelectConversation(id);
    onClose?.();
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-canvas-rail">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 text-white shadow">
          <Sparkles className="h-4 w-4" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-100">
          AI Control Plane
        </p>
      </div>

      <div className="px-4">
        <WorkspaceSelector />
      </div>

      <nav aria-label="Primary" className="mt-6 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeNav;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectNav(item.key);
                    onClose?.();
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    isActive
                      ? "bg-canvas-active text-ink-100"
                      : "text-ink-300 hover:bg-canvas-hover hover:text-ink-100"
                  }`}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent-cyan"
                    />
                  ) : null}
                  <Icon className={`h-[18px] w-[18px] ${isActive ? "text-accent-cyan" : "text-ink-400"}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.key === "approvals" && approvalsCount > 0 ? (
                    <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-accent-cyan/20 px-1.5 text-[10px] font-semibold text-accent-cyan">
                      {approvalsCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-4">
        <div className="flex items-center justify-between pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Conversations
          </p>
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose?.();
            }}
            className="text-xs font-medium text-accent-cyan hover:underline"
          >
            + New
          </button>
        </div>

        {status === "error" ? (
          <p className="text-xs text-signal-danger">Failed to load.</p>
        ) : null}
        {status === "success" && conversations.length === 0 ? (
          <p className="text-xs text-ink-500">No conversations yet.</p>
        ) : null}

        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {conversations.map((conversation) => {
            const Icon = conversationIcon(conversation.title);
            const isActive = conversation.id === activeConversationId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => handleConversationSelect(conversation.id)}
                  className={`relative flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left ${
                    isActive
                      ? "bg-canvas-active text-ink-100"
                      : "text-ink-300 hover:bg-canvas-hover hover:text-ink-100"
                  }`}
                  title={conversation.title}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent-cyan"
                    />
                  ) : null}
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? "text-accent-cyan" : "text-ink-400"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-tight">
                      {conversation.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-500">
                      {relativeTime(conversation.updated_at)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <UserProfile email={userEmail} onLogout={onLogout} />
    </aside>
  );
}
