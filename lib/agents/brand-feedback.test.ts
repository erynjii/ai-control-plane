import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBrandFeedbackCache,
  fetchBrandEditsForWorkspace,
  type BrandFeedbackSupabase
} from "./brand-feedback";

type Row = { field: string; before: string; after: string };

interface FakeCall {
  fn: string;
  args: unknown[];
}

function fakeSupabase(rows: Row[], error: Error | null = null) {
  const calls: FakeCall[] = [];
  const builder: {
    select: (cols: string) => typeof builder;
    eq: (col: string, val: unknown) => typeof builder;
    order: (col: string, opts?: unknown) => typeof builder;
    limit: (n: number) => Promise<{ data: Row[]; error: Error | null }>;
  } = {
    select(cols) {
      calls.push({ fn: "select", args: [cols] });
      return builder;
    },
    eq(col, val) {
      calls.push({ fn: "eq", args: [col, val] });
      return builder;
    },
    order(col, opts) {
      calls.push({ fn: "order", args: [col, opts] });
      return builder;
    },
    async limit(n) {
      calls.push({ fn: "limit", args: [n] });
      return { data: rows, error };
    }
  };
  const supabase: BrandFeedbackSupabase = {
    from(table: string) {
      calls.push({ fn: "from", args: [table] });
      return builder;
    }
  };
  return { supabase, calls };
}

beforeEach(() => {
  clearBrandFeedbackCache();
});

describe("fetchBrandEditsForWorkspace", () => {
  it("queries manager_edits joined on assets.workspace_id, maps to the compact shape", async () => {
    const rows: Row[] = [
      { field: "output", before: "Old caption A", after: "New caption A" },
      { field: "output", before: "Old caption B", after: "New caption B" }
    ];
    const { supabase, calls } = fakeSupabase(rows);

    const edits = await fetchBrandEditsForWorkspace(supabase, "ws_alpha");

    expect(edits).toHaveLength(2);
    expect(edits[0]).toEqual({
      field: "output",
      before: "Old caption A",
      after: "New caption A"
    });

    // Pin the contract: join via assets!inner(workspace_id), filter on
    // assets.workspace_id, order desc, limit 20 by default.
    expect(calls.find((c) => c.fn === "select")?.args[0]).toContain("assets!inner(workspace_id)");
    const eq = calls.find((c) => c.fn === "eq");
    expect(eq?.args).toEqual(["assets.workspace_id", "ws_alpha"]);
    const order = calls.find((c) => c.fn === "order");
    expect(order?.args[0]).toBe("edited_at");
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(false);
    expect(calls.find((c) => c.fn === "limit")?.args).toEqual([20]);
  });

  it("returns [] and doesn't throw when the query errors", async () => {
    const { supabase } = fakeSupabase([], new Error("rls denied"));
    const edits = await fetchBrandEditsForWorkspace(supabase, "ws_alpha");
    expect(edits).toEqual([]);
  });

  it("serves cached data within the TTL without re-hitting supabase", async () => {
    const rows: Row[] = [{ field: "output", before: "A", after: "B" }];
    const { supabase, calls } = fakeSupabase(rows);

    // Pin the clock so the cache TTL stays in range.
    const t0 = 1_000_000;
    await fetchBrandEditsForWorkspace(supabase, "ws_alpha", { now: () => t0 });
    const hitsAfterFirst = calls.length;

    await fetchBrandEditsForWorkspace(supabase, "ws_alpha", {
      now: () => t0 + 30 * 60 * 1000 // 30 min later — still inside 1h TTL
    });
    expect(calls.length).toBe(hitsAfterFirst); // no new calls
  });

  it("refetches when the TTL expires", async () => {
    const rows: Row[] = [{ field: "output", before: "A", after: "B" }];
    const { supabase, calls } = fakeSupabase(rows);

    const t0 = 1_000_000;
    await fetchBrandEditsForWorkspace(supabase, "ws_alpha", { now: () => t0 });
    const hitsAfterFirst = calls.length;

    await fetchBrandEditsForWorkspace(supabase, "ws_alpha", {
      now: () => t0 + 61 * 60 * 1000 // >1h later — cache expired
    });
    expect(calls.length).toBeGreaterThan(hitsAfterFirst);
  });

  it("caches per workspace — two workspaces each incur their own fetch", async () => {
    const { supabase, calls } = fakeSupabase([]);
    await fetchBrandEditsForWorkspace(supabase, "ws_a");
    const afterWsA = calls.length;
    await fetchBrandEditsForWorkspace(supabase, "ws_b");
    expect(calls.length).toBeGreaterThan(afterWsA);
  });

  it("honors a custom limit for tests that want smaller pages", async () => {
    const { supabase, calls } = fakeSupabase([]);
    await fetchBrandEditsForWorkspace(supabase, "ws_alpha", { limit: 5 });
    expect(calls.find((c) => c.fn === "limit")?.args).toEqual([5]);
  });
});
