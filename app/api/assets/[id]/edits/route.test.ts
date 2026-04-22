// Security tests for GET /api/assets/[id]/edits.
// Same pattern as app/api/pipeline-runs/route.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

import { GET } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type FakeUser = { id: string } | null;
type Row = {
  id: string;
  field: string;
  edited_at: string;
  before?: string;
  after?: string;
};

function fakeClient({ user, rows }: { user: FakeUser; rows: Row[] }) {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const builder: {
    select: (columns: string) => typeof builder;
    eq: (column: string, value: unknown) => typeof builder;
    order: (column: string, opts?: unknown) => Promise<{ data: Row[]; error: null }>;
  } = {
    select(columns) {
      calls.push({ fn: "select", args: [columns] });
      return builder;
    },
    eq(column, value) {
      calls.push({ fn: "eq", args: [column, value] });
      return builder;
    },
    async order(column, opts) {
      calls.push({ fn: "order", args: [column, opts] });
      return { data: rows, error: null };
    }
  };
  const client = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : new Error("AuthSessionMissingError")
      })
    },
    from(table: string) {
      calls.push({ fn: "from", args: [table] });
      return builder;
    }
  };
  return { client, calls };
}

const mocked = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;

function requestFor(params: string = ""): Request {
  return new Request(`http://localhost/api/assets/asset_A/edits${params}`);
}

describe("GET /api/assets/[id]/edits", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("(a) no session → 401", async () => {
    const { client } = fakeClient({ user: null, rows: [] });
    mocked.mockReturnValueOnce(client);
    const res = await GET(requestFor(), { params: { id: "asset_A" } });
    expect(res.status).toBe(401);
  });

  it("(b) auth'd as a different user → 200 with count=0, latest=null (RLS strips rows)", async () => {
    const { client, calls } = fakeClient({ user: { id: "user_B" }, rows: [] });
    mocked.mockReturnValueOnce(client);

    const res = await GET(requestFor(), { params: { id: "asset_A" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, latest: null });

    // Route trusts RLS — no app-code user_id filter.
    const eqCalls = calls.filter((c) => c.fn === "eq");
    expect(eqCalls).toHaveLength(1);
    expect(eqCalls[0].args).toEqual(["asset_id", "asset_A"]);
  });

  it("(c) auth'd as the owner → 200 with count + latest", async () => {
    const { client } = fakeClient({
      user: { id: "user_A" },
      rows: [
        { id: "edit_2", field: "output", edited_at: "2026-04-22T00:02:00.000Z" },
        { id: "edit_1", field: "output", edited_at: "2026-04-22T00:01:00.000Z" }
      ]
    });
    mocked.mockReturnValueOnce(client);

    const res = await GET(requestFor(), { params: { id: "asset_A" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      count: 2,
      latest: { field: "output", editedAt: "2026-04-22T00:02:00.000Z" }
    });
  });

  it("(b) vs (c-no-edits) produce identical responses — no presence oracle", async () => {
    const { client: cross } = fakeClient({ user: { id: "user_B" }, rows: [] });
    mocked.mockReturnValueOnce(cross);
    const resCross = await GET(requestFor(), { params: { id: "asset_A" } });

    const { client: owner } = fakeClient({ user: { id: "user_A" }, rows: [] });
    mocked.mockReturnValueOnce(owner);
    const resOwnerNoEdits = await GET(requestFor(), { params: { id: "asset_no_edits" } });

    expect(resCross.status).toBe(resOwnerNoEdits.status);
    expect(await resCross.json()).toEqual(await resOwnerNoEdits.json());
  });

  it("(d) default shape does NOT include the edits array and selects only the compact columns", async () => {
    const { client, calls } = fakeClient({
      user: { id: "user_A" },
      rows: [{ id: "edit_1", field: "output", edited_at: "2026-04-22T00:00:00.000Z" }]
    });
    mocked.mockReturnValueOnce(client);

    const res = await GET(requestFor(), { params: { id: "asset_A" } });
    const body = await res.json();
    expect(body).not.toHaveProperty("edits");

    const selectCols = (calls.find((c) => c.fn === "select")?.args[0] ?? "") as string;
    expect(selectCols).not.toContain("before");
    expect(selectCols).not.toContain("after");
  });

  it("(e) include=full returns edits array with before/after and selects the full column set", async () => {
    const { client, calls } = fakeClient({
      user: { id: "user_A" },
      rows: [
        {
          id: "edit_2",
          field: "output",
          before: "We got it.",
          after: "We've got it.",
          edited_at: "2026-04-22T00:02:00.000Z"
        },
        {
          id: "edit_1",
          field: "output",
          before: "Best ever.",
          after: "A new favourite.",
          edited_at: "2026-04-22T00:01:00.000Z"
        }
      ]
    });
    mocked.mockReturnValueOnce(client);

    const res = await GET(requestFor("?include=full"), { params: { id: "asset_A" } });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.count).toBe(2);
    expect(body.latest).toEqual({ field: "output", editedAt: "2026-04-22T00:02:00.000Z" });
    expect(body.edits).toHaveLength(2);
    expect(body.edits[0]).toEqual({
      id: "edit_2",
      field: "output",
      before: "We got it.",
      after: "We've got it.",
      editedAt: "2026-04-22T00:02:00.000Z"
    });
    expect(body.edits[1].before).toBe("Best ever.");

    const selectCols = (calls.find((c) => c.fn === "select")?.args[0] ?? "") as string;
    expect(selectCols).toContain("before");
    expect(selectCols).toContain("after");
  });

  it("(f) include=full with RLS-stripped rowset returns empty edits array — still no presence oracle", async () => {
    const { client } = fakeClient({ user: { id: "user_B" }, rows: [] });
    mocked.mockReturnValueOnce(client);

    const res = await GET(requestFor("?include=full"), { params: { id: "asset_A" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0, latest: null, edits: [] });
  });
});
