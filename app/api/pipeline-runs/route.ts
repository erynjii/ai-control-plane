import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/pipeline-runs?asset_id=<uuid>
// Returns the single pipeline_runs row attached to an asset the caller owns
// (RLS enforces user_id match). Used by the Activity Timeline's agent-output
// drawer to surface the full PipelineContext on demand, instead of shipping
// every run with the global audit-events feed.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetId = url.searchParams.get("asset_id");
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

  const { data, error } = await supabase
    .from("pipeline_runs")
    .select(
      "id, asset_id, total_cost_usd, duration_ms, model_versions, max_flag_severity, context, created_at"
    )
    .eq("asset_id", assetId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load pipeline run." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No pipeline run for this asset." }, { status: 404 });
  }

  return NextResponse.json({ pipelineRun: data });
}
