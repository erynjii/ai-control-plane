import { NextResponse } from "next/server";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DESTINATIONS, DESTINATION_STATUSES, type Destination, type DestinationStatus } from "@/lib/integrations/types";
import { ASSET_SELECT } from "@/lib/assets/select";

function parseStatus(value: string | null): AssetStatus | null {
  if (!value) return null;
  return (ASSET_STATUSES as readonly string[]).includes(value) ? (value as AssetStatus) : null;
}

function parsePromoted(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function parseDestination(value: string | null): Destination | null {
  if (!value) return null;
  return (DESTINATIONS as readonly string[]).includes(value) ? (value as Destination) : null;
}

function parseDestinationStatus(value: string | null): DestinationStatus | null {
  if (!value) return null;
  return (DESTINATION_STATUSES as readonly string[]).includes(value) ? (value as DestinationStatus) : null;
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
  const promotedFilter = parsePromoted(url.searchParams.get("promoted"));
  const destinationFilter = parseDestination(url.searchParams.get("destination"));
  const destinationStatusFilter = parseDestinationStatus(url.searchParams.get("destinationStatus"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;

  let query = supabase
    .from("assets")
    .select(ASSET_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  if (promotedFilter !== null) {
    query = query.eq("promoted", promotedFilter);
  }

  if (destinationFilter) {
    query = query.eq("destination", destinationFilter);
  }

  if (destinationStatusFilter) {
    query = query.eq("destination_status", destinationStatusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to load assets." }, { status: 500 });
  }

  return NextResponse.json({ assets: data ?? [] });
}
