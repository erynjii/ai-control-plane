"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, signOut } from "@/lib/supabase/auth";
import { AIWorkspace } from "@/components/dashboard/ai-workspace";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { AuditTrailCard } from "@/components/dashboard/audit-trail-card";
import { Header } from "@/components/dashboard/header";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { LeftRail, type NavItem } from "@/components/dashboard/left-rail";
import { PanelCard } from "@/components/dashboard/panel-card";
import { PromotedAssetsCard } from "@/components/dashboard/promoted-assets-card";

type DashboardState = {
  loading: boolean;
  email: string | null;
  error: string | null;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Workspace", targetId: "panel-workspace" },
  { label: "Approvals", targetId: "panel-approvals" },
  { label: "Assets", targetId: "panel-assets" },
  { label: "Audit Trail", targetId: "panel-audit" },
  { label: "Insights", targetId: "panel-insights" },
  { label: "Settings" }
];

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        // Non-fatal: the dashboard will still render empty.
      }

      if (!isMounted) return;
      setState({
        loading: false,
        email: user.email ?? null,
        error: null
      });
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
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
  };

  const handleConversationCreated = (id: string) => {
    setActiveConversationId(id);
    setConversationRefreshKey((key) => key + 1);
  };

  const bumpAssets = () => {
    setAssetRefreshKey((key) => key + 1);
    setConversationRefreshKey((key) => key + 1); // touch updated_at so list reorders
  };

  if (state.loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-6 py-16">
        <p className="text-sm text-slate-300">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 hover:border-slate-500 md:hidden"
          aria-label="Open navigation"
        >
          Menu
        </button>
        <div className="flex-1">
          <Header email={state.email} onLogout={handleLogout} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)_300px]">
        <div className="hidden md:block md:row-start-1 md:h-fit md:sticky md:top-4">
          <LeftRail
            navItems={NAV_ITEMS}
            activeConversationId={activeConversationId}
            conversationsRefreshKey={conversationRefreshKey}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewChat}
          />
        </div>

        <div
          id="panel-workspace"
          className="flex min-h-[80vh] flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 scroll-mt-4 md:p-5"
        >
          <AIWorkspace
            key={activeConversationId ?? "new"}
            conversationId={activeConversationId}
            onConversationCreated={handleConversationCreated}
            onAssetChanged={bumpAssets}
          />
        </div>

        <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1 lg:row-start-1 lg:col-start-3 lg:sticky lg:top-4 lg:h-fit">
          <PanelCard id="panel-assets" title="Assets" subtitle="Latest saved assets">
            <PromotedAssetsCard refreshKey={assetRefreshKey} />
          </PanelCard>

          <PanelCard id="panel-approvals" title="Approvals Queue" subtitle="Ready for review">
            <ApprovalQueue refreshKey={assetRefreshKey} onAction={bumpAssets} />
          </PanelCard>

          <PanelCard id="panel-audit" title="Creation Audit Trail" subtitle="Publishing events">
            <AuditTrailCard refreshKey={assetRefreshKey} />
          </PanelCard>

          <PanelCard id="panel-insights" title="Insights" subtitle="Pipeline at a glance">
            <InsightsCard refreshKey={assetRefreshKey} />
          </PanelCard>
        </div>
      </div>

      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 md:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="absolute left-0 top-0 h-full w-[280px] overflow-y-auto bg-slate-950 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <LeftRail
              navItems={NAV_ITEMS}
              activeConversationId={activeConversationId}
              conversationsRefreshKey={conversationRefreshKey}
              onSelectConversation={(id) => {
                handleSelectConversation(id);
                setMobileNavOpen(false);
              }}
              onNewChat={() => {
                handleNewChat();
                setMobileNavOpen(false);
              }}
              onClose={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
    </main>
  );
}
