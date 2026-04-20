"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, signOut } from "@/lib/supabase/auth";
import { AIWorkspace } from "@/components/dashboard/ai-workspace";
import { AssetHistory } from "@/components/dashboard/asset-history";
import { Header } from "@/components/dashboard/header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Sidebar } from "@/components/dashboard/sidebar";

type DashboardState = {
  loading: boolean;
  email: string | null;
  error: string | null;
};

const SIDEBAR_ITEMS = ["Workspace", "Approvals", "Audit Trail", "Insights"];

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({
    loading: true,
    email: null,
    error: null
  });
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const { user, error } = await getCurrentUser();

      if (!isMounted) return;

      if (error || !user) {
        router.replace("/login");
        return;
      }

      setState({
        loading: false,
        email: user.email ?? null,
        error: null
      });
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  if (state.loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16">
        <p className="text-sm text-slate-300">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-6 py-6">
      <Header email={state.email} onLogout={handleLogout} />

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar items={SIDEBAR_ITEMS} />

        <div className="flex flex-col gap-4">
          <AIWorkspace onGenerated={() => setAssetRefreshKey((key) => key + 1)} />

          <div className="grid gap-4 md:grid-cols-2">
            <PanelCard
              title="Prompt Compliance Scanner"
              subtitle="Risk checks for generated content."
            >
              <p className="text-sm text-slate-400">Scan engine not yet wired. Placeholder panel.</p>
            </PanelCard>

            <PanelCard
              title="Content Approval Queue"
              subtitle="Pending review before publish."
            >
              <p className="text-sm text-slate-400">Approval workflow coming soon.</p>
            </PanelCard>

            <PanelCard
              title="Creation Audit Trail"
              subtitle="Every generation, tracked."
            >
              <AssetHistory refreshKey={assetRefreshKey} />
            </PanelCard>

            <PanelCard
              title="Revenue Insights"
              subtitle="Usage and attribution signals."
            >
              <p className="text-sm text-slate-400">Analytics integration planned.</p>
            </PanelCard>
          </div>
        </div>
      </div>

      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
    </main>
  );
}
