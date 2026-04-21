"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { getCurrentUser, signOut } from "@/lib/supabase/auth";
import { AIWorkspace } from "@/components/dashboard/ai-workspace";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ConnectedAccounts } from "@/components/dashboard/connected-accounts";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { LeftRail, type NavKey } from "@/components/dashboard/left-rail";

type DashboardState = {
  loading: boolean;
  email: string | null;
  error: string | null;
};

const NAV_SCROLL_TARGETS: Record<NavKey, string | null> = {
  workspace: "workspace-anchor",
  approvals: "approvals-card",
  assets: "approvals-card",
  audit: "activity-card",
  insights: "insights-card",
  settings: null
};

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({
    loading: true,
    email: null,
    error: null
  });
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>("workspace");
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const rightRailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      const { user, error } = await getCurrentUser();
      if (!isMounted) return;
      if (error || !user) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch("/api/conversations");
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { conversations?: Array<{ id: string }> }
            | null;
          const existing = payload?.conversations ?? [];
          if (existing.length === 0) {
            const seedResponse = await fetch("/api/seed", { method: "POST" });
            if (seedResponse.ok && isMounted) {
              setAssetRefreshKey((key) => key + 1);
              setConversationRefreshKey((key) => key + 1);
            }
          }
        }
      } catch {
        // Non-fatal: dashboard still renders empty.
      }

      if (!isMounted) return;
      setState({ loading: false, email: user.email ?? null, error: null });
    };

    bootstrap();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const handleSelectConversation = (id: string | null) => {
    setActiveConversationId(id);
    setActiveNav("workspace");
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setActiveNav("workspace");
  };

  const handleConversationCreated = (id: string) => {
    if (id) {
      setActiveConversationId(id);
    } else {
      setActiveConversationId(null);
    }
    setConversationRefreshKey((key) => key + 1);
  };

  const bumpAssets = useCallback(() => {
    setAssetRefreshKey((key) => key + 1);
    setConversationRefreshKey((key) => key + 1);
  }, []);

  const handleSelectNav = (key: NavKey) => {
    setActiveNav(key);
    const targetId = NAV_SCROLL_TARGETS[key];
    if (targetId && typeof document !== "undefined") {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleApprovalsCount = useCallback((count: number) => {
    setApprovalsCount(count);
  }, []);

  if (state.loading) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-canvas-base">
        <p className="text-sm text-ink-400">Loading dashboard…</p>
      </main>
    );
  }

  const leftRail = (
    <LeftRail
      activeConversationId={activeConversationId}
      activeNav={activeNav}
      conversationsRefreshKey={conversationRefreshKey}
      approvalsCount={approvalsCount}
      userEmail={state.email}
      onSelectConversation={handleSelectConversation}
      onSelectNav={handleSelectNav}
      onNewChat={handleNewChat}
      onLogout={handleLogout}
      onClose={() => setMobileNavOpen(false)}
    />
  );

  return (
    <div className="flex h-screen w-full bg-canvas-base text-ink-100">
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-line-soft md:flex">
        {leftRail}
      </aside>

      <main id="workspace-anchor" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-md border border-line-soft p-2 text-ink-300 hover:bg-canvas-hover"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-ink-100">AI Control Plane</p>
        </div>
        <div className="flex-1 px-6 py-6">
          <AIWorkspace
            key={activeConversationId ?? "new"}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
            onAssetChanged={bumpAssets}
          />
        </div>
      </main>

      <aside
        ref={rightRailRef}
        className="hidden w-[320px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line-soft bg-canvas-rail p-4 lg:flex"
      >
        <div id="approvals-card">
          <ApprovalQueue
            refreshKey={assetRefreshKey}
            onAction={bumpAssets}
            onCountChange={handleApprovalsCount}
          />
        </div>
        <div id="activity-card">
          <ActivityTimeline refreshKey={assetRefreshKey} />
        </div>
        <div id="insights-card">
          <InsightsCard refreshKey={assetRefreshKey} />
        </div>
        <ConnectedAccounts />
      </aside>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-canvas-base/80 md:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto bg-canvas-rail"
            onClick={(event) => event.stopPropagation()}
          >
            {leftRail}
          </div>
        </div>
      ) : null}
    </div>
  );
}
