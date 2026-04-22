import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/assets/[id]/edits
// Default shape (used by the approval card's badge + tooltip):
//   { count, latest: { field, editedAt } | null }
//
// With ?include=full (used by PR 4's diff viewer):
//   { count, latest, edits: Array<{ id, field, before, after, editedAt }> }
// Returned in reverse-chronological order (newest first) so the drawer
// can show the most recent edit as the default selection without a
// client-side sort.
//
// Scoping via RLS (manager_edits_select_own on auth.uid() = user_id).
// Cross-user requests see an empty rowset and get `{ count: 0, latest: null }`
// — same response as an asset that genuinely has no edits. No enumeration
// oracle. With include=full the edits array is also empty in that case.

interface FullEdit {
  id: string;
  field: string;
  before: string;
  after: string;
  editedAt: string;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const includeFull = new URL(request.url).searchParams.get("include") === "full";
  // When include=full we need before/after too. Selecting the extra columns
  // in the default path is harmless (same row set, RLS unchanged) but we
  // keep the default payload compact to avoid wire-size churn on the
  // approval-card polling path.
  const columns = includeFull
    ? "id, field, before, after, edited_at"
    : "id, field, edited_at";

  const { data, error } = await supabase
    .from("manager_edits")
    .select(columns)
    .eq("asset_id", params.id)
    .order("edited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load manager edits." }, { status: 500 });
  }

  // Double cast: supabase-js infers the row type from the select string
  // literal, but we build `columns` dynamically above so the inferred
  // type is a ParserError branch. RLS + the known schema mean the
  // runtime shape is well-defined.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    field: string;
    edited_at: string;
    before?: string;
    after?: string;
  }>;
  const latest = rows[0] ?? null;

  const payload: {
    count: number;
    latest: { field: string; editedAt: string } | null;
    edits?: FullEdit[];
  } = {
    count: rows.length,
    latest: latest ? { field: latest.field, editedAt: latest.edited_at } : null
  };

  if (includeFull) {
    payload.edits = rows.map((row) => ({
      id: row.id,
      field: row.field,
      before: row.before ?? "",
      after: row.after ?? "",
      editedAt: row.edited_at
    }));
  }

  return NextResponse.json(payload);
}
