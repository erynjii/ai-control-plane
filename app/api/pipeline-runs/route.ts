import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/pipeline-runs?asset_id=<uuid>[&run_id=<uuid>]
//
// Returns pipeline_runs rows for an asset the caller owns, ordered by
// created_at desc (newest first). After the 1:N regenerate change an asset
// may have multiple runs; this endpoint returns all of them.
//
// Optional ?run_id filter narrows to a specific run (used by the timeline
// drawer when the clicked event carries a runId in its metadata).
//
// Scoping is via RLS (pipeline_runs_select_own USING auth.uid() = user_id).
// Cross-user requests return an empty array — same outward response as an
// asset with no runs, so no enumeration oracle.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetId = url.searchParams.get("asset_id");
  const runId = url.searchParams.get("run_id");

  if (!assetId) {
    return NextResponse.json({ error: "asset_id is required." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let query = supabase
    .from("pipeline_runs")
    .select(
      "id, asset_id, total_cost_usd, duration_ms, model_versions, max_flag_severity, context, created_at"
    )
    .eq("asset_id", assetId);

  if (runId) {
    query = query.eq("id", runId);
  }

  // .order() is the terminal call; keeps the query shape consistent
  // whether or not the optional run_id filter was applied.
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load pipeline runs." }, { status: 500 });
  }

  return NextResponse.json({ pipelineRuns: data ?? [] });
}
