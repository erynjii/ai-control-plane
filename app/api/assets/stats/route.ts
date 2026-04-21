import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type StatusCounts = {
  draft: number;
  pending_review: number;
  approved: number;
  rejected: number;
};

type RiskCounts = {
  low: number;
  medium: number;
  high: number;
  unknown: number;
};

export async function GET() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [totalResult, promotedResult] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("status, risk_level").eq("promoted", true)
  ]);

  if (totalResult.error || promotedResult.error) {
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }

  const byStatus: StatusCounts = { draft: 0, pending_review: 0, approved: 0, rejected: 0 };
  const byRisk: RiskCounts = { low: 0, medium: 0, high: 0, unknown: 0 };

  for (const row of (promotedResult.data ?? []) as Array<{ status: string; risk_level: string }>) {
    switch (row.status) {
      case "draft":
        byStatus.draft += 1;
        break;
      case "pending_review":
        byStatus.pending_review += 1;
        break;
      case "approved":
        byStatus.approved += 1;
        break;
      case "rejected":
        byStatus.rejected += 1;
        break;
    }
    switch (row.risk_level) {
      case "low":
        byRisk.low += 1;
        break;
      case "medium":
        byRisk.medium += 1;
        break;
      case "high":
        byRisk.high += 1;
        break;
      default:
        byRisk.unknown += 1;
    }
  }

  return NextResponse.json({
    totalAssets: totalResult.count ?? 0,
    promotedTotal: promotedResult.data?.length ?? 0,
    byStatus,
    byRisk
  });
}
