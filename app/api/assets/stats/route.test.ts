// Tests for the extended /api/assets/stats endpoint.
//
// Stubs the supabase client with deterministic rows and asserts:
//   - auth gate (401 on missing session)
//   - window param parsing (defaults to this_month, accepts 7d/30d)
//   - new metric shape: editRate, timeToApproveSeconds, costPerApprovedUsd
//   - compareTo=previous returns previousPeriod block for rolling
//     windows, null for this_month
//   - back-compat: flat top-level fields still present for existing UI

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The route issues 6 queries per period — one per chained call. We can't
// disambiguate which query a builder belongs to from .from("assets") alone
// (several hit the same table), so we tag each builder chain by the columns
// the route passes to .select(). That's stable and matches what real
// Supabase sees.
type QueryShape = "count" | "promoted" | "publishing" | "approval_rows" | "edited_assets" | "run_costs";

function shapeOf(selectCols: string, options: { head?: boolean } = {}): QueryShape {
  if (options.head) return "count";
  if (selectCols.includes("manager_edits")) return "edited_assets";
  if (selectCols.includes("total_cost_usd")) return "run_costs";
  if (selectCols.includes("destination")) return "publishing";
  if (selectCols.includes("risk_level")) return "promoted";
  if (selectCols.includes("updated_at")) return "approval_rows";
  return "count";
}

interface StubDataset {
  totalAssets: number;
  promoted: Array<{ status: string; risk_level: string }>;
  publishing: Array<{ destination: string | null; destination_status: string }>;
  approvalRows: Array<{ id: string; created_at: string; updated_at: string }>;
  editedAssets: Array<{ id: string }>;
  runCosts: Array<{ total_cost_usd: number }>;
}

function emptyDataset(): StubDataset {
  return {
    totalAssets: 0,
    promoted: [],
    publishing: [],
    approvalRows: [],
    editedAssets: [],
    runCosts: []
  };
}

function fakeClient(opts: {
  user: { id: string } | null;
  current: StubDataset;
  previous?: StubDataset;
}) {
  // Route runs current period first, then (if compareTo=previous + rolling)
  // the previous period. Each period issues 6 builder chains. We feed rows
  // from whichever period is "active" by counting how many count+promoted
  // sequences we've seen.
  let periodIndex = 0;
  let queriesSeenInPeriod = 0;

  function datasetForCurrentPeriod(): StubDataset {
    if (periodIndex === 0) return opts.current;
    return opts.previous ?? emptyDataset();
  }

  function advancePeriodTracker() {
    queriesSeenInPeriod += 1;
    if (queriesSeenInPeriod >= 6) {
      periodIndex += 1;
      queriesSeenInPeriod = 0;
    }
  }

  function resolveRows(shape: QueryShape): { data: unknown; error: null; count?: number } {
    const ds = datasetForCurrentPeriod();
    switch (shape) {
      case "count":
        return { data: [], error: null, count: ds.totalAssets };
      case "promoted":
        return { data: ds.promoted, error: null };
      case "publishing":
        return { data: ds.publishing, error: null };
      case "approval_rows":
        return { data: ds.approvalRows, error: null };
      case "edited_assets":
        return { data: ds.editedAssets, error: null };
      case "run_costs":
        return { data: ds.runCosts, error: null };
    }
  }

  function buildTerminal(shape: QueryShape) {
    // Resolve against the current period BEFORE advancing the tracker —
    // otherwise the 6th query in a period sees queriesSeenInPeriod roll
    // over and reads rows from the next period.
    const value = resolveRows(shape);
    advancePeriodTracker();
    return Promise.resolve(value);
  }

  function builder(initialShape: QueryShape) {
    const state = { shape: initialShape };
    const chain = {
      select(_cols: string, options?: { head?: boolean }) {
        // head:true means .select("id", { count: "exact", head: true })
        if (options?.head) state.shape = "count";
        return chain;
      },
      eq() {
        return chain;
      },
      gte() {
        return chain;
      },
      lte() {
        return chain;
      },
      // Force await-point. The route's final chained call resolves the
      // promise; we return one here.
      then(
        onFulfilled?: (value: ReturnType<typeof resolveRows>) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        return buildTerminal(state.shape).then(onFulfilled, onRejected);
      }
    };
    return chain;
  }

  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.user },
        error: opts.user ? null : new Error("AuthSessionMissingError")
      })
    },
    from(_table: string) {
      // Start with an "unknown" shape; the first .select() fixes it.
      const proxy: {
        select: (cols: string, options?: { head?: boolean }) => ReturnType<typeof builder>;
      } = {
        select(cols: string, options?: { head?: boolean }) {
          const shape = shapeOf(cols, options);
          return builder(shape);
        }
      };
      return proxy;
    }
  };
}

const mocked = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocked.mockReset();
});

function requestFor(params: Record<string, string> = {}): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/assets/stats${qs ? `?${qs}` : ""}`);
}

describe("GET /api/assets/stats (PR 4)", () => {
  it("returns 401 when there is no session", async () => {
    mocked.mockReturnValueOnce(fakeClient({ user: null, current: emptyDataset() }));
    const res = await GET(requestFor());
    expect(res.status).toBe(401);
  });

  it("defaults window to this_month when no query param is supplied", async () => {
    mocked.mockReturnValueOnce(
      fakeClient({ user: { id: "user_A" }, current: emptyDataset() })
    );
    const res = await GET(requestFor());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window).toBe("this_month");
  });

  it("computes the new metrics on current period", async () => {
    const current: StubDataset = {
      totalAssets: 10,
      promoted: [
        { status: "approved", risk_level: "low" },
        { status: "approved", risk_level: "medium" },
        { status: "approved", risk_level: "low" },
        { status: "rejected", risk_level: "high" }
      ],
      publishing: [],
      approvalRows: [
        { id: "a1", created_at: "2026-04-01T00:00:00.000Z", updated_at: "2026-04-01T00:01:00.000Z" }, // 60s
        { id: "a2", created_at: "2026-04-01T00:00:00.000Z", updated_at: "2026-04-01T00:03:00.000Z" }, // 180s
        { id: "a3", created_at: "2026-04-01T00:00:00.000Z", updated_at: "2026-04-01T00:05:00.000Z" } // 300s → median = 180
      ],
      editedAssets: [{ id: "a1" }], // 1 of 3 approved has edits → 33.33%
      runCosts: [
        { total_cost_usd: 0.10 },
        { total_cost_usd: 0.15 },
        { total_cost_usd: 0.05 } // sum = 0.30; per-approved = 0.10
      ]
    };
    mocked.mockReturnValueOnce(fakeClient({ user: { id: "user_A" }, current }));

    const res = await GET(requestFor({ window: "7d" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.window).toBe("7d");
    expect(body.totalAssets).toBe(10);
    expect(body.approvedCount).toBe(3);
    expect(body.editedApprovedCount).toBe(1);
    expect(body.editRate).toBeCloseTo(1 / 3, 4);
    expect(body.timeToApproveSeconds).toBe(180);
    expect(body.costPerApprovedUsd).toBeCloseTo(0.1, 4);
  });

  it("returns null metrics when there are no approved posts to divide by", async () => {
    mocked.mockReturnValueOnce(
      fakeClient({ user: { id: "user_A" }, current: emptyDataset() })
    );
    const res = await GET(requestFor({ window: "30d" }));
    const body = await res.json();
    expect(body.editRate).toBeNull();
    expect(body.timeToApproveSeconds).toBeNull();
    expect(body.costPerApprovedUsd).toBeNull();
  });

  it("compareTo=previous returns a previousPeriod block on rolling windows", async () => {
    mocked.mockReturnValueOnce(
      fakeClient({
        user: { id: "user_A" },
        current: emptyDataset(),
        previous: {
          ...emptyDataset(),
          totalAssets: 42,
          promoted: [{ status: "approved", risk_level: "low" }]
        }
      })
    );
    const res = await GET(requestFor({ window: "7d", compareTo: "previous" }));
    const body = await res.json();
    expect(body.previousPeriod).not.toBeNull();
    expect(body.previousPeriod.totalAssets).toBe(42);
  });

  it("compareTo=previous is null on this_month (trend comparison isn't meaningful)", async () => {
    mocked.mockReturnValueOnce(
      fakeClient({ user: { id: "user_A" }, current: emptyDataset() })
    );
    const res = await GET(requestFor({ window: "this_month", compareTo: "previous" }));
    const body = await res.json();
    expect(body.previousPeriod).toBeNull();
  });

  it("preserves back-compat flat shape (totalAssets/byStatus/...) at the top level", async () => {
    mocked.mockReturnValueOnce(
      fakeClient({ user: { id: "user_A" }, current: emptyDataset() })
    );
    const res = await GET(requestFor());
    const body = await res.json();
    expect(body).toHaveProperty("totalAssets");
    expect(body).toHaveProperty("promotedTotal");
    expect(body).toHaveProperty("byStatus");
    expect(body).toHaveProperty("byRisk");
    expect(body).toHaveProperty("publishedTotal");
    expect(body).toHaveProperty("failedTotal");
    expect(body).toHaveProperty("byDestination");
  });
});
