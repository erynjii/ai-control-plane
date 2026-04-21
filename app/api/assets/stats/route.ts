import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DESTINATIONS, type Destination } from "@/lib/integrations/types";

type StatusCounts = {
  draft: number;
  pending_review: number;
  approved: number;
  rejected: number;
  queued: number;
  published: number;
  failed: number;
};

type RiskCounts = {
  low: number;
  medium: number;
  high: number;
  unknown: number;
};

type DestinationBreakdown = Record<Destination, number>;

export async function GET() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [totalResult, promotedResult, publishingResult] = await Promise.all([
    supabase.from("assets").select("id", { count: "exact", head: true }),
    supabase.from("assets").select("status, risk_level").eq("promoted", true),
    supabase.from("assets").select("destination, destination_status")
  ]);

  if (totalResult.error || promotedResult.error || publishingResult.error) {
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }

  const byStatus: StatusCounts = {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    queued: 0,
    published: 0,
    failed: 0
  };
  const byRisk: RiskCounts = { low: 0, medium: 0, high: 0, unknown: 0 };

  for (const row of (promotedResult.data ?? []) as Array<{ status: string; risk_level: string }>) {
    if (row.status in byStatus) {
      byStatus[row.status as keyof StatusCounts] += 1;
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

  let publishedTotal = 0;
  let failedTotal = 0;
  const byDestination: DestinationBreakdown = { instagram: 0, facebook: 0, email: 0, website: 0 };

  for (const row of (publishingResult.data ?? []) as Array<{
    destination: string | null;
    destination_status: string;
  }>) {
    if (row.destination_status === "published") publishedTotal += 1;
    if (row.destination_status === "failed") failedTotal += 1;
    if (
      row.destination_status === "published" &&
      row.destination &&
      (DESTINATIONS as readonly string[]).includes(row.destination)
    ) {
      byDestination[row.destination as Destination] += 1;
    }
  }

  return NextResponse.json({
    totalAssets: totalResult.count ?? 0,
    promotedTotal: promotedResult.data?.length ?? 0,
    byStatus,
    byRisk,
    publishedTotal,
    failedTotal,
    byDestination
  });
}
