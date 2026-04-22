import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/assets/[id]/edits
// Returns a compact summary of manager_edits for an asset:
//   { count, latest: { field, editedAt } | null }
// Used by the approval card's "edited" badge and tooltip. PR 4 will
// introduce a diff-viewer endpoint that returns full before/after text.
//
// Scoping via RLS (manager_edits_select_own on auth.uid() = user_id).
// Cross-user requests see an empty rowset and get `{ count: 0, latest: null }`
// — same response as an asset that genuinely has no edits. No enumeration
// oracle.

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("manager_edits")
    .select("id, field, edited_at")
    .eq("asset_id", params.id)
    .order("edited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load manager edits." }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: string; field: string; edited_at: string }>;
  const latest = rows[0] ?? null;

  return NextResponse.json({
    count: rows.length,
    latest: latest ? { field: latest.field, editedAt: latest.edited_at } : null
  });
}
