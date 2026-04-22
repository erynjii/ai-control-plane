// Brand agent feedback loop: fetches the last N manager_edits for assets
// in a workspace and caches them in-process for the TTL so repeated Brand
// invocations within the window don't re-hit Supabase.
//
// This is a per-process cache — in a multi-instance deployment each
// server gets its own cache. That's acceptable for the MVP (workspace
// volume is low; worst case is one stale fetch per server per hour when
// an edit lands). A shared cache (Redis, Supabase) is a follow-up.
//
// Matches the existing codebase pattern: pure fetcher that takes a
// loose SupabaseLike (so tests pass a fake client) and returns a
// narrowed result type.

import type { BrandEditHistoryEntry } from "@/lib/types";

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour per brief
const DEFAULT_LIMIT = 20;

/** Loose type so both the real @supabase/supabase-js client and hand-rolled
 *  test fakes satisfy it. The fetcher never inspects types beyond .from(). */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface BrandFeedbackSupabase {
  from(table: string): any;
}

interface CacheEntry {
  expiresAt: number;
  edits: BrandEditHistoryEntry[];
}

const cache = new Map<string, CacheEntry>();

export function clearBrandFeedbackCache(): void {
  cache.clear();
}

export interface FetchBrandEditsOptions {
  ttlMs?: number;
  limit?: number;
  /** Override the clock for tests. */
  now?: () => number;
}

/** Return the last `limit` manager_edits rows for assets in a workspace.
 *  Empty array means no edits yet — callers still proceed, just without a
 *  feedback section in the prompt. */
export async function fetchBrandEditsForWorkspace(
  supabase: BrandFeedbackSupabase,
  workspaceId: string,
  options: FetchBrandEditsOptions = {}
): Promise<BrandEditHistoryEntry[]> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const now = options.now?.() ?? Date.now();

  const cached = cache.get(workspaceId);
  if (cached && cached.expiresAt > now) {
    return cached.edits;
  }

  // manager_edits has no workspace_id column today, so we join via
  // assets.workspace_id. Supabase PostgREST embedded syntax:
  //   select=field,before,after,assets!inner(workspace_id)
  //   where assets.workspace_id = <id>
  const { data, error } = await supabase
    .from("manager_edits")
    .select("field, before, after, assets!inner(workspace_id)")
    .eq("assets.workspace_id", workspaceId)
    .order("edited_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Non-fatal: return whatever was cached, or an empty list. Brand stays
    // operational without the feedback section.
    return cached?.edits ?? [];
  }

  const rows = (data ?? []) as Array<{
    field: BrandEditHistoryEntry["field"];
    before: string;
    after: string;
  }>;
  const edits: BrandEditHistoryEntry[] = rows.map((r) => ({
    field: r.field,
    before: r.before,
    after: r.after
  }));

  cache.set(workspaceId, { expiresAt: now + ttlMs, edits });
  return edits;
}
