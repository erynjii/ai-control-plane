"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, signOut } from "@/lib/supabase/auth";

type DashboardState = {
  loading: boolean;
  email: string | null;
  error: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({
    loading: true,
    email: null,
    error: null
  });

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
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-16">
        <p className="text-sm text-slate-300">Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">AI Control Plane Dashboard</h1>
      <p className="text-sm text-slate-300">Signed in as: {state.email ?? "Unknown user"}</p>
      <button
        type="button"
        onClick={handleLogout}
        className="w-fit rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:border-slate-400"
      >
        Logout
      </button>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
    </main>
  );
}
