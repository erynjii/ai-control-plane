// Security tests for GET /api/pipeline-runs.
//
// Intentional shape of the test:
// - vi.mock("@/lib/supabase/server") is hoisted above the route import so
//   the server module (which pulls in next/headers) never actually loads.
// - Each case hands the route a different fake Supabase client to simulate
//   the three RLS-relevant scenarios:
//     (a) no session        — auth.getUser returns null → route should 401
//     (b) wrong-user auth   — RLS filters the rows; query returns []
//                             → route should 200 with empty array
//     (c) owner auth        — rows returned → 200 with array
//
// The endpoint moved from 1:1 to 1:N in this PR (pipeline_runs.id is no
// longer unique per asset — regenerate produces additional rows). A
// cross-user response is now an empty array rather than 404; this is
// indistinguishable from a legitimately empty result (v1 asset with no
// pipeline run), so no enumeration oracle.
//
// What this NEVER verifies: the RLS policy itself — that's enforced by
// Postgres and pinned in migration 0010_create_pipeline_runs.sql. This
// test locks in the route's *trust* of RLS (no extra app-code user_id
// filter, no service-role bypass).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FakeUser = { id: string } | null;
type FakeRow = Record<string, unknown>;

function fakeClient({ user, rows }: { user: FakeUser; rows: FakeRow[] }) {
  // Tracks each call the route makes on the Supabase query builder. We
  // assert the route applies no app-code user_id filter — scoping comes
  // from RLS on auth.uid() alone.
  const calls: Array<{ fn: string; args: unknown[] }> = [];

  function queryBuilder() {
    const builder: {
      select: (columns: string) => typeof builder;
      eq: (column: string, value: unknown) => typeof builder;
      order: (column: string, opts?: unknown) => Promise<{ data: FakeRow[]; error: null }>;
    } = {
      select(columns: string) {
        calls.push({ fn: "select", args: [columns] });
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push({ fn: "eq", args: [column, value] });
        return builder;
      },
      async order(column: string, opts?: unknown) {
        calls.push({ fn: "order", args: [column, opts] });
        return { data: rows, error: null };
      }
    };
    return builder;
  }

  const client = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : new Error("AuthSessionMissingError")
      })
    },
    from(table: string) {
      calls.push({ fn: "from", args: [table] });
      return queryBuilder();
    }
  };
  return { client, calls };
}

function requestFor(assetId?: string, runId?: string): Request {
  const params = new URLSearchParams();
  if (assetId) params.set("asset_id", assetId);
  if (runId) params.set("run_id", runId);
  const qs = params.toString();
  return new Request(`http://localhost/api/pipeline-runs${qs ? `?${qs}` : ""}`);
}

const mockedFactory = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/pipeline-runs", () => {
  beforeEach(() => {
    mockedFactory.mockReset();
  });

  it("returns 400 when asset_id is missing (before auth check)", async () => {
    const res = await GET(requestFor());
    expect(res.status).toBe(400);
    expect(mockedFactory).not.toHaveBeenCalled();
  });

  describe("security", () => {
    it("(a) no session → 401", async () => {
      const { client } = fakeClient({ user: null, rows: [] });
      mockedFactory.mockReturnValueOnce(client);
      const res = await GET(requestFor("asset_A"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized.");
    });

    it("(b) auth'd as a different user → 200 empty array (RLS strips rows, no enumeration leak)", async () => {
      const { client, calls } = fakeClient({
        user: { id: "user_B" },
        rows: []
      });
      mockedFactory.mockReturnValueOnce(client);

      const res = await GET(requestFor("asset_owned_by_user_A"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ pipelineRuns: [] });

      // Pin the route's trust-RLS contract: the query filters only by
      // asset_id (and optionally run_id when passed). No app-code user_id
      // filter. If a future refactor adds one, this assertion fires.
      const eqCalls = calls.filter((c) => c.fn === "eq");
      expect(eqCalls).toHaveLength(1);
      expect(eqCalls[0].args).toEqual(["asset_id", "asset_owned_by_user_A"]);
    });

    it("(c) auth'd as the owner → 200 with the rows, newest first", async () => {
      const rows = [
        {
          id: "run_2",
          asset_id: "asset_owned_by_user_A",
          total_cost_usd: 0.05,
          duration_ms: 2100,
          model_versions: { copy: "gpt-4.1-mini" },
          max_flag_severity: null,
          context: {},
          created_at: "2026-04-22T00:10:00.000Z"
        },
        {
          id: "run_1",
          asset_id: "asset_owned_by_user_A",
          total_cost_usd: 0.24,
          duration_ms: 4200,
          model_versions: { strategy: "gpt-4.1-mini" },
          max_flag_severity: "warning",
          context: {},
          created_at: "2026-04-22T00:00:00.000Z"
        }
      ];
      const { client, calls } = fakeClient({
        user: { id: "user_A" },
        rows
      });
      mockedFactory.mockReturnValueOnce(client);

      const res = await GET(requestFor("asset_owned_by_user_A"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pipelineRuns).toHaveLength(2);
      expect(body.pipelineRuns[0].id).toBe("run_2");
      expect(body.pipelineRuns[1].id).toBe("run_1");

      // Assert the route ordered by created_at desc.
      const orderCalls = calls.filter((c) => c.fn === "order");
      expect(orderCalls).toHaveLength(1);
      expect(orderCalls[0].args[0]).toBe("created_at");
      expect(orderCalls[0].args[1]).toEqual({ ascending: false });
    });

    it("(b) vs (c) produce identical outward responses for 'not found' — no presence oracle", async () => {
      const { client: otherUser } = fakeClient({ user: { id: "user_B" }, rows: [] });
      mockedFactory.mockReturnValueOnce(otherUser);
      const resCrossUser = await GET(requestFor("asset_owned_by_user_A"));

      const { client: owner } = fakeClient({ user: { id: "user_A" }, rows: [] });
      mockedFactory.mockReturnValueOnce(owner);
      const resNoRun = await GET(requestFor("asset_exists_no_runs"));

      expect(resCrossUser.status).toBe(resNoRun.status);
      expect(await resCrossUser.json()).toEqual(await resNoRun.json());
    });

    it("filters by run_id when supplied, in addition to asset_id", async () => {
      const { client, calls } = fakeClient({
        user: { id: "user_A" },
        rows: [
          {
            id: "run_specific",
            asset_id: "asset_X",
            total_cost_usd: 0.05,
            duration_ms: 100,
            model_versions: {},
            max_flag_severity: null,
            context: {},
            created_at: "2026-04-22T00:10:00.000Z"
          }
        ]
      });
      mockedFactory.mockReturnValueOnce(client);

      const res = await GET(requestFor("asset_X", "run_specific"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pipelineRuns).toHaveLength(1);
      expect(body.pipelineRuns[0].id).toBe("run_specific");

      // Both filters applied.
      const eqCalls = calls.filter((c) => c.fn === "eq");
      expect(eqCalls).toHaveLength(2);
      expect(eqCalls[0].args).toEqual(["asset_id", "asset_X"]);
      expect(eqCalls[1].args).toEqual(["id", "run_specific"]);
    });
  });
});
