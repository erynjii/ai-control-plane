// Tests for the PATCH /api/assets/[id] edit-capture behavior.
//
// Focus is the new side-effect: when the caller supplies `output`, the
// route must INSERT a manager_edits row with the correct before/after.
// It must NOT insert when output is absent, unchanged, or when the status
// check fails.
//
// vi.mock pattern mirrors app/api/pipeline-runs/route.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

import { PATCH } from "./route";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AssetsRow = { status: string; output?: string };
type UpdateResult = { data: Record<string, unknown> | null; error: unknown };

interface FakeClientOptions {
  user: { id: string } | null;
  existing?: AssetsRow | null;
  updateError?: unknown;
  editError?: unknown;
}

function fakeClient(options: FakeClientOptions) {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const updates: Array<{ table: string; payload: unknown }> = [];

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.user },
        error: options.user ? null : new Error("AuthSessionMissingError")
      })
    },
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({ data: options.existing ?? null, error: null })
              };
            }
          };
        },
        update(payload: unknown) {
          updates.push({ table, payload });
          const result: UpdateResult = {
            data: options.updateError
              ? null
              : {
                  id: "asset_1",
                  ...(options.existing ?? {}),
                  ...(payload as Record<string, unknown>)
                },
            error: options.updateError ?? null
          };
          return {
            eq() {
              return {
                select() {
                  return { single: async () => result };
                }
              };
            }
          };
        },
        insert(row: unknown) {
          inserts.push({ table, row });
          return Object.assign(Promise.resolve({ error: options.editError ?? null }), {});
        }
      };
    }
  };
  return { client, inserts, updates };
}

const mocked = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;

function requestFor(body: unknown): Request {
  return new Request("http://localhost/api/assets/asset_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("PATCH /api/assets/[id] manager_edits capture", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("inserts a manager_edits row when output actually changes", async () => {
    const { client, inserts } = fakeClient({
      user: { id: "user_A" },
      existing: { status: "draft", output: "Old caption" }
    });
    mocked.mockReturnValueOnce(client);

    const res = await PATCH(requestFor({ output: "New caption" }), {
      params: { id: "asset_1" }
    });
    expect(res.status).toBe(200);

    const editInserts = inserts.filter((i) => i.table === "manager_edits");
    expect(editInserts).toHaveLength(1);
    expect(editInserts[0].row).toMatchObject({
      asset_id: "asset_1",
      user_id: "user_A",
      field: "output",
      before: "Old caption",
      after: "New caption"
    });
  });

  it("does NOT insert when output is absent (e.g. status-only PATCH)", async () => {
    const { client, inserts } = fakeClient({
      user: { id: "user_A" },
      existing: { status: "draft" }
    });
    mocked.mockReturnValueOnce(client);

    const res = await PATCH(requestFor({ status: "pending_review" }), {
      params: { id: "asset_1" }
    });
    expect(res.status).toBe(200);

    expect(inserts.filter((i) => i.table === "manager_edits")).toHaveLength(0);
  });

  it("does NOT insert when output is submitted but unchanged", async () => {
    const SAME = "Same caption.";
    const { client, inserts } = fakeClient({
      user: { id: "user_A" },
      existing: { status: "draft", output: SAME }
    });
    mocked.mockReturnValueOnce(client);

    const res = await PATCH(requestFor({ output: SAME }), {
      params: { id: "asset_1" }
    });
    expect(res.status).toBe(200);

    expect(inserts.filter((i) => i.table === "manager_edits")).toHaveLength(0);
  });

  it("does NOT insert when the status gate rejects the edit (e.g. approved)", async () => {
    const { client, inserts } = fakeClient({
      user: { id: "user_A" },
      existing: { status: "approved", output: "Locked" }
    });
    mocked.mockReturnValueOnce(client);

    const res = await PATCH(requestFor({ output: "Attempted change" }), {
      params: { id: "asset_1" }
    });
    expect(res.status).toBe(409);

    expect(inserts.filter((i) => i.table === "manager_edits")).toHaveLength(0);
  });

  it("returns 401 when no session (no reads or writes attempted)", async () => {
    const { client, inserts } = fakeClient({ user: null });
    mocked.mockReturnValueOnce(client);

    const res = await PATCH(requestFor({ output: "X" }), { params: { id: "asset_1" } });
    expect(res.status).toBe(401);
    expect(inserts).toHaveLength(0);
  });
});
