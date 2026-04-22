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

export type WindowKey = "this_month" | "7d" | "30d";

interface WindowRange {
  /** ISO string; inclusive start of the window. */
  startIso: string;
  /** ISO string; inclusive end of the window (usually now). */
  endIso: string;
}

export interface PeriodMetrics {
  totalAssets: number;
  promotedTotal: number;
  byStatus: StatusCounts;
  byRisk: RiskCounts;
  publishedTotal: number;
  failedTotal: number;
  byDestination: DestinationBreakdown;
  approvedCount: number;
  editedApprovedCount: number;
  /** null when not computable (no approved posts / no timing data). */
  editRate: number | null;
  timeToApproveSeconds: number | null;
  costPerApprovedUsd: number | null;
}

function parseWindow(value: string | null): WindowKey {
  if (value === "7d" || value === "30d" || value === "this_month") return value;
  return "this_month";
}

function computeWindowRange(window: WindowKey, now: Date = new Date()): WindowRange {
  const endIso = now.toISOString();
  if (window === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso };
  }
  if (window === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso };
  }
  // this_month: from the 1st of the current UTC month.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { startIso: start.toISOString(), endIso };
}

/** Trend arrows only make sense on rolling windows. Comparing Nov 1–12 vs
 *  Oct 1–12 is rolling-apples-to-apples; comparing Nov 1–12 vs Oct 1–31
 *  is misleading. For "this_month" we return null so the UI hides trends. */
function computePreviousRange(window: WindowKey, current: WindowRange, now: Date): WindowRange | null {
  if (window === "this_month") return null;
  const endDate = new Date(current.startIso);
  const periodMs = now.getTime() - endDate.getTime();
  const startDate = new Date(endDate.getTime() - periodMs);
  return { startIso: startDate.toISOString(), endIso: endDate.toISOString() };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function emptyStatusCounts(): StatusCounts {
  return {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    queued: 0,
    published: 0,
    failed: 0
  };
}

function emptyRiskCounts(): RiskCounts {
  return { low: 0, medium: 0, high: 0, unknown: 0 };
}

function emptyDestinationBreakdown(): DestinationBreakdown {
  return { instagram: 0, facebook: 0, email: 0, website: 0 };
}

async function computePeriodMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  range: WindowRange
): Promise<PeriodMetrics | null> {
  const [
    createdResult,
    promotedResult,
    publishingResult,
    approvalRowsResult,
    editedAssetsResult,
    runCostsResult
  ] = await Promise.all([
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    supabase
      .from("assets")
      .select("status, risk_level")
      .eq("promoted", true)
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    supabase
      .from("assets")
      .select("destination, destination_status")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    // time-to-approve: proxy via (approval-time updated_at - created_at)
    // for status=approved rows. TODO(pr4-refine): track state transitions
    // in audit_events so this can be the real pending_review → approved
    // delta. Audit already tracks lifecycle changes downstream; adding
    // upstream transitions is non-trivial and out of scope here.
    supabase
      .from("assets")
      .select("id, created_at, updated_at")
      .eq("status", "approved")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    // Approved assets that accumulated at least one manager_edit.
    supabase
      .from("assets")
      .select("id, manager_edits!inner(id)")
      .eq("status", "approved")
      .gte("created_at", range.startIso)
      .lte("created_at", range.endIso),
    // Sum pipeline_runs.total_cost_usd for approved assets in window.
    supabase
      .from("pipeline_runs")
      .select("total_cost_usd, asset_id, assets!inner(status, created_at)")
      .eq("assets.status", "approved")
      .gte("assets.created_at", range.startIso)
      .lte("assets.created_at", range.endIso)
  ]);

  if (
    createdResult.error ||
    promotedResult.error ||
    publishingResult.error ||
    approvalRowsResult.error ||
    editedAssetsResult.error ||
    runCostsResult.error
  ) {
    return null;
  }

  const byStatus = emptyStatusCounts();
  const byRisk = emptyRiskCounts();
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
  const byDestination = emptyDestinationBreakdown();
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

  const approvalRows = (approvalRowsResult.data ?? []) as Array<{
    id: string;
    created_at: string;
    updated_at: string;
  }>;
  const approvedCount = approvalRows.length;

  const approvalSeconds: number[] = approvalRows
    .map((row) => {
      const start = Date.parse(row.created_at);
      const end = Date.parse(row.updated_at);
      if (Number.isNaN(start) || Number.isNaN(end)) return null;
      return Math.max(0, Math.round((end - start) / 1000));
    })
    .filter((v): v is number => v !== null);
  const timeToApproveSeconds = median(approvalSeconds);

  const editedApprovedCount = ((editedAssetsResult.data ?? []) as Array<{ id: string }>).length;
  const editRate = approvedCount > 0 ? editedApprovedCount / approvedCount : null;

  const runCosts = (runCostsResult.data ?? []) as Array<{ total_cost_usd: number | string }>;
  const totalRunCostUsd = runCosts.reduce(
    (sum, row) =>
      sum +
      (typeof row.total_cost_usd === "number"
        ? row.total_cost_usd
        : Number(row.total_cost_usd) || 0),
    0
  );
  const costPerApprovedUsd =
    approvedCount > 0 ? Math.round((totalRunCostUsd / approvedCount) * 10_000) / 10_000 : null;

  return {
    totalAssets: createdResult.count ?? 0,
    promotedTotal: promotedResult.data?.length ?? 0,
    byStatus,
    byRisk,
    publishedTotal,
    failedTotal,
    byDestination,
    approvedCount,
    editedApprovedCount,
    editRate,
    timeToApproveSeconds,
    costPerApprovedUsd
  };
}

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  const compareTo = url.searchParams.get("compareTo"); // "previous" | null
  const now = new Date();

  const currentRange = computeWindowRange(window, now);
  const currentMetrics = await computePeriodMetrics(supabase, currentRange);
  if (!currentMetrics) {
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }

  let previousMetrics: PeriodMetrics | null = null;
  if (compareTo === "previous") {
    const previousRange = computePreviousRange(window, currentRange, now);
    if (previousRange) {
      previousMetrics = await computePeriodMetrics(supabase, previousRange);
    }
    // For this_month, previousMetrics stays null — UI hides trend arrows.
  }

  return NextResponse.json({
    window,
    range: currentRange,
    // Back-compat flat shape for PR 2's InsightsCard (totalAssets /
    // byStatus / publishedTotal / failedTotal / byDestination at root).
    totalAssets: currentMetrics.totalAssets,
    promotedTotal: currentMetrics.promotedTotal,
    byStatus: currentMetrics.byStatus,
    byRisk: currentMetrics.byRisk,
    publishedTotal: currentMetrics.publishedTotal,
    failedTotal: currentMetrics.failedTotal,
    byDestination: currentMetrics.byDestination,
    // New PR 4 metrics.
    approvedCount: currentMetrics.approvedCount,
    editedApprovedCount: currentMetrics.editedApprovedCount,
    editRate: currentMetrics.editRate,
    timeToApproveSeconds: currentMetrics.timeToApproveSeconds,
    costPerApprovedUsd: currentMetrics.costPerApprovedUsd,
    previousPeriod: previousMetrics
  });
}
