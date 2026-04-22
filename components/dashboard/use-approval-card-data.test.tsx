import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { clearApprovalCardCache, useApprovalCardData } from "./use-approval-card-data";

function stubFetch(handler: (input: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => handler(input)));
}

beforeEach(() => {
  clearApprovalCardCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApprovalCardData", () => {
  it("fetches pipeline run + edits in parallel for a given assetId", async () => {
    const calls: string[] = [];
    stubFetch((input) => {
      calls.push(input);
      if (input.startsWith("/api/pipeline-runs")) {
        return new Response(
          JSON.stringify({
            pipelineRuns: [
              {
                id: "run_1",
                asset_id: "asset_1",
                total_cost_usd: 0.1,
                duration_ms: 1000,
                max_flag_severity: "warning",
                model_versions: {},
                context: {
                  postId: "asset_1",
                  userPrompt: "",
                  workspaceId: "ws",
                  connectedAccountId: null,
                  platform: "instagram",
                  flags: [],
                  stepLog: []
                },
                created_at: "2026-04-22T00:00:00.000Z"
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (input.includes("/edits")) {
        return new Response(
          JSON.stringify({ count: 2, latest: { field: "output", editedAt: "x" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("", { status: 404 });
    });

    const { result } = renderHook(() => useApprovalCardData("asset_1", 0));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.latestRun?.id).toBe("run_1");
    expect(result.current.edits).toEqual({
      count: 2,
      latest: { field: "output", editedAt: "x" }
    });
    expect(result.current.error).toBeNull();

    // Parallel: both endpoints hit before the hook finished loading.
    expect(calls.some((u) => u.startsWith("/api/pipeline-runs"))).toBe(true);
    expect(calls.some((u) => u.includes("/edits"))).toBe(true);
  });

  it("serves cached data on re-mount without re-fetching", async () => {
    let hits = 0;
    stubFetch((input) => {
      hits += 1;
      if (input.startsWith("/api/pipeline-runs")) {
        return new Response(JSON.stringify({ pipelineRuns: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ count: 0, latest: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const first = renderHook(() => useApprovalCardData("asset_1", 0));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const hitsAfterFirst = hits;

    const second = renderHook(() => useApprovalCardData("asset_1", 0));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(hits).toBe(hitsAfterFirst); // cache served second mount
    expect(second.result.current.edits).toEqual({ count: 0, latest: null });
  });

  it("busts the cache when refreshKey changes", async () => {
    let hits = 0;
    stubFetch((input) => {
      hits += 1;
      if (input.startsWith("/api/pipeline-runs")) {
        return new Response(JSON.stringify({ pipelineRuns: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ count: 0, latest: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const { result, rerender } = renderHook(({ k }) => useApprovalCardData("asset_1", k), {
      initialProps: { k: 0 }
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const hitsAfterFirst = hits;

    rerender({ k: 1 });
    await waitFor(() => expect(hits).toBeGreaterThan(hitsAfterFirst));
  });

  it("does nothing when assetId is null", async () => {
    stubFetch(() => new Response("", { status: 500 }));
    const { result } = renderHook(() => useApprovalCardData(null, 0));
    expect(result.current.loading).toBe(false);
    expect(result.current.latestRun).toBeNull();
    expect(result.current.edits).toBeNull();
  });

  it("surfaces an error message when either fetch fails", async () => {
    stubFetch((input) => {
      if (input.startsWith("/api/pipeline-runs")) {
        return new Response("", { status: 500 });
      }
      return new Response(JSON.stringify({ count: 0, latest: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const { result } = renderHook(() => useApprovalCardData("asset_err", 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("pipeline-runs");
  });
});
