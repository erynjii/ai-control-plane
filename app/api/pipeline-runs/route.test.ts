// Security tests for GET /api/pipeline-runs.
//
// Intentional shape of the test:
// - vi.mock("@/lib/supabase/server") is hoisted above the route import so
//   the server module (which pulls in next/headers) never actually loads.
// - Each case hands the route a different fake Supabase client to simulate
//   the three RLS-relevant scenarios:
//     (a) no session        — auth.getUser returns null → route should 401
//     (b) wrong-user auth    — RLS strips the row; .maybeSingle() returns
//                              { data: null } → route should 404
//     (c) owner auth         — .maybeSingle() returns the row → 200
//
// What this NEVER verifies: the RLS policy itself — that's enforced by
// Postgres and pinned in migration 0010_create_pipeline_runs.sql. This
// test locks in the route's *trust* of RLS (no extra app-code filter
// and no service-role bypass).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FakeUser = { id: string } | null;
type FakeRow = Record<string, unknown> | null;

function fakeClient({ user, row }: { user: FakeUser; row: FakeRow }) {
  // Tracks whether the route applies an app-code user_id filter. We assert
  // it does NOT — scoping is meant to come from RLS on auth.uid().
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : new Error("AuthSessionMissingError")
      })
    },
    from(table: string) {
      calls.push({ fn: "from", args: [table] });
      return {
        select(columns: string) {
          calls.push({ fn: "select", args: [columns] });
          return {
            eq(column: string, value: unknown) {
              calls.push({ fn: "eq", args: [column, value] });
              return {
                maybeSingle: async () => ({ data: row, error: null })
              };
            }
          };
        }
      };
    }
  };
  return { client, calls };
}

function requestFor(assetId?: string): Request {
  const url = assetId
    ? `http://localhost/api/pipeline-runs?asset_id=${encodeURIComponent(assetId)}`
    : "http://localhost/api/pipeline-runs";
  return new Request(url);
}

const mockedFactory = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/pipeline-runs", () => {
  // Reset between tests so mockReturnValueOnce queues don't leak across cases
  // — particularly the 400-path test which never consumes a mock.
  beforeEach(() => {
    mockedFactory.mockReset();
  });

  it("returns 400 when asset_id is missing (before auth check)", async () => {
    // Route short-circuits before createSupabaseServerClient is called.
    const res = await GET(requestFor());
    expect(res.status).toBe(400);
    expect(mockedFactory).not.toHaveBeenCalled();
  });

  describe("security", () => {
    it("(a) no session → 401", async () => {
      const { client } = fakeClient({ user: null, row: null });
      mockedFactory.mockReturnValueOnce(client);
      const res = await GET(requestFor("asset_A"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized.");
    });

    it("(b) auth'd as a different user → 404 (RLS strips the row, no enumeration leak)", async () => {
      // User B authenticates; asset_A belongs to user A.
      // When the route does .select().eq("asset_id", "asset_A").maybeSingle(),
      // Postgres applies RLS first (auth.uid() = user_id), user B's uid
      // doesn't match, so the row is invisible. The fake here simulates
      // that outcome by returning { data: null }.
      const { client, calls } = fakeClient({
        user: { id: "user_B" },
        row: null
      });
      mockedFactory.mockReturnValueOnce(client);

      const res = await GET(requestFor("asset_owned_by_user_A"));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("No pipeline run for this asset.");

      // Pin the route's trust-RLS contract: the query only filters by
      // asset_id. If someone adds an app-code user_id filter later this
      // test will start seeing two .eq() calls and needs re-evaluation.
      const eqCalls = calls.filter((c) => c.fn === "eq");
      expect(eqCalls).toHaveLength(1);
      expect(eqCalls[0].args).toEqual(["asset_id", "asset_owned_by_user_A"]);
    });

    it("(c) auth'd as the owner → 200 with the row", async () => {
      const row = {
        id: "run_abc",
        asset_id: "asset_owned_by_user_A",
        total_cost_usd: 0.12,
        duration_ms: 4200,
        model_versions: { strategy: "gpt-4.1-mini" },
        max_flag_severity: null,
        context: {},
        created_at: "2026-04-22T00:00:00.000Z"
      };
      const { client } = fakeClient({
        user: { id: "user_A" },
        row
      });
      mockedFactory.mockReturnValueOnce(client);

      const res = await GET(requestFor("asset_owned_by_user_A"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pipelineRun).toMatchObject({
        id: "run_abc",
        asset_id: "asset_owned_by_user_A"
      });
    });

    it("(b) vs (c) produce identical outward responses for 'not found' — no presence oracle", async () => {
      // Cross-check: when asset_id genuinely doesn't exist, the response
      // must be byte-identical to case (b). This rules out an enumeration
      // oracle that distinguishes "doesn't exist" from "belongs to someone else".
      const { client: otherUser } = fakeClient({
        user: { id: "user_B" },
        row: null
      });
      mockedFactory.mockReturnValueOnce(otherUser);
      const resCrossUser = await GET(requestFor("asset_owned_by_user_A"));

      const { client: owner } = fakeClient({
        user: { id: "user_A" },
        row: null // simulates: asset exists but has no pipeline_run yet (v1 asset)
      });
      mockedFactory.mockReturnValueOnce(owner);
      const resNoRun = await GET(requestFor("asset_exists_no_run"));

      expect(resCrossUser.status).toBe(resNoRun.status);
      expect(await resCrossUser.json()).toEqual(await resNoRun.json());
    });
  });
});
