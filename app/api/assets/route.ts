import { NextResponse } from "next/server";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseStatus(value: string | null): AssetStatus | null {
  if (!value) return null;
  return (ASSET_STATUSES as readonly string[]).includes(value) ? (value as AssetStatus) : null;
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
  const statusFilter = parseStatus(url.searchParams.get("status"));

  let query = supabase
    .from("assets")
    .select("id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load assets." }, { status: 500 });
  }

  return NextResponse.json({ assets: data ?? [] });
}
