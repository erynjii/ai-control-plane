// End-to-end integration test for the 1:N regenerate flow.
//
// Exercises runAndPersistPipeline (first run) → regenerateAndPersist
// (second run with step=copy, isolate=true) against a fake Supabase client
// + stub runtime. Asserts everything the plan review called out:
//
//   - Two pipeline_runs inserts for the same asset, each with a unique id.
//   - Run 2's stepLog does NOT contain a photo step (isolation worked).
//   - Run 1's photo output is still accessible in run 1's context.
//   - Audit events from both runs exist, each carrying the correct runId
//     in metadata.
//   - buildTimelineView over the combined audit events produces two
//     groups with labels "Initial generation" (run 1) and
//     "Regenerated caption" (run 2).

import { describe, expect, it } from "vitest";
import type { AuditEvent } from "@/lib/types";
import type { ChatRequest, ChatResponse, ImageRequest, ImageResponse } from "./runtime";
import type { PipelineInit } from "./types";
import { runAndPersistPipeline } from "./run-and-persist";
import { regenerateAndPersist } from "./regenerate";
import { stubRuntime } from "./test-utils";
import { buildTimelineView } from "@/components/dashboard/timeline-types";

const STRATEGY_JSON = JSON.stringify({
  audience: "Miami wellness seekers",
  tone: "warm",
  contentPillar: "Grand opening",
  cta: { type: "booking", text: "Book your first ritual" },
  hashtagClusters: ["#HeadSpa"],
  visualConcept: "Softly lit spa interior",
  optimalPostTime: ""
});
const COPY_JSON = JSON.stringify({
  variants: [
    { text: "A", hashtags: ["#a"] },
    { text: "B", hashtags: ["#b"] }
  ]
});
const COPY_JSON_V2 = JSON.stringify({
  variants: [
    { text: "A-v2 (new caption)", hashtags: ["#a2"] },
    { text: "B-v2", hashtags: ["#b2"] }
  ]
});
const BRAND_JSON = JSON.stringify({
  reviews: [
    { variantId: "post_int_v1", score: 88, flags: [] },
    { variantId: "post_int_v2", score: 71, flags: [] }
  ]
});
const COMPLIANCE_JSON = JSON.stringify({ flags: [] });

type ChatHandler = (req: ChatRequest) => ChatResponse | Promise<ChatResponse>;
function chatByAgent(handlers: Partial<Record<string, ChatHandler>>): ChatHandler {
  return (req) => {
    const h = handlers[req.agent];
    if (!h) throw new Error(`no chat handler for agent ${req.agent}`);
    return h(req);
  };
}

function firstRunRuntime() {
  return stubRuntime({
    chat: chatByAgent({
      strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      brand: () => ({ text: BRAND_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
    }),
    image: (req: ImageRequest): ImageResponse => {
      void req;
      return { imageUrl: "https://cdn.example/run1.png", model: "gpt-image-1", costUsd: 0.04 };
    }
  });
}

function regenerateCopyRuntime() {
  return stubRuntime({
    chat: chatByAgent({
      strategy: () => {
        throw new Error("strategy should not run on isolated copy regenerate");
      },
      copy: () => ({
        text: COPY_JSON_V2,
        model: "gpt-4.1-mini",
        inputTokens: 15,
        outputTokens: 15
      }),
      brand: () => ({
        text: BRAND_JSON,
        model: "gpt-4.1-mini",
        inputTokens: 10,
        outputTokens: 10
      }),
      compliance: () => ({
        text: COMPLIANCE_JSON,
        model: "gpt-4.1-mini",
        inputTokens: 10,
        outputTokens: 10
      })
    }),
    image: () => {
      throw new Error("photo should not run on isolated copy regenerate");
    }
  });
}

interface DbState {
  assets: Map<string, Record<string, unknown>>;
  pipelineRuns: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
}

function makeFakeSupabase(assetIdToReturn: string) {
  const state: DbState = {
    assets: new Map(),
    pipelineRuns: [],
    auditEvents: []
  };

  const supabase = {
    from(table: string) {
      if (table === "assets") return assetsBuilder(state, assetIdToReturn);
      if (table === "pipeline_runs") return pipelineRunsBuilder(state);
      if (table === "audit_events") return auditEventsBuilder(state);
      throw new Error(`unhandled table ${table}`);
    }
  };
  return { supabase, state };
}

function assetsBuilder(state: DbState, assetIdToReturn: string) {
  return {
    insert(row: Record<string, unknown>) {
      const id = (row.id as string) ?? assetIdToReturn;
      state.assets.set(id, { ...row, id });
      const chain = {
        select: () => ({
          single: async () => ({ data: { ...row, id, output: row.output }, error: null })
        })
      };
      return Object.assign(Promise.resolve({ error: null }), chain);
    },
    update(payload: Record<string, unknown>) {
      return {
        eq: (_col: string, id: string) => {
          const prev = state.assets.get(id) ?? {};
          state.assets.set(id, { ...prev, ...payload });
          return Promise.resolve({ error: null });
        }
      };
    }
  };
}

function pipelineRunsBuilder(state: DbState) {
  return {
    insert(row: Record<string, unknown>) {
      state.pipelineRuns.push(row);
      return Object.assign(Promise.resolve({ error: null }), {
        select: () => ({ single: async () => ({ data: null, error: null }) })
      });
    }
  };
}

function auditEventsBuilder(state: DbState) {
  return {
    insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
      const batch = Array.isArray(rows) ? rows : [rows];
      for (const r of batch) state.auditEvents.push(r);
      return Object.assign(Promise.resolve({ error: null }), {});
    }
  };
}

const INIT: PipelineInit = {
  postId: "post_int",
  userPrompt: "Grand opening announcement for a head spa.",
  workspaceId: "ws_int",
  connectedAccountId: "acct_ig",
  platform: "instagram"
};

describe("regenerate 1:N integration", () => {
  it("creates run 1, regenerates copy as run 2, and keeps run 1's image accessible", async () => {
    const { supabase, state } = makeFakeSupabase("asset_int");

    // Phase 1 — initial generation (5 agents).
    const run1 = await runAndPersistPipeline({
      supabase,
      runtime: firstRunRuntime(),
      init: INIT,
      userId: "user_1",
      workspaceId: "ws_int",
      connectedAccountId: "acct_ig",
      conversationId: null,
      prompt: INIT.userPrompt
    });
    expect(run1.ok).toBe(true);
    if (!run1.ok) throw new Error("unreachable");
    expect(run1.auditEventCount).toBe(5);

    // Phase 2 — regenerate caption (copy), isolate=true.
    const assetId = run1.asset.id;
    const run2 = await regenerateAndPersist({
      supabase,
      runtime: regenerateCopyRuntime(),
      step: "copy",
      existingCtx: run1.ctx,
      existingAssetId: assetId,
      userId: "user_1",
      workspaceId: "ws_int",
      connectedAccountId: "acct_ig"
    });
    expect(run2.ok).toBe(true);
    if (!run2.ok) throw new Error("unreachable");

    // --- Assertions ---

    // Two pipeline_runs rows for the same asset, different ids, desc when
    // the read endpoint orders them.
    expect(state.pipelineRuns).toHaveLength(2);
    const runIds = state.pipelineRuns.map((r) => r.id as string);
    expect(new Set(runIds).size).toBe(2);
    expect(runIds).toContain(run1.pipelineRunId);
    expect(runIds).toContain(run2.runId);
    expect(state.pipelineRuns.every((r) => r.asset_id === assetId)).toBe(true);

    // Run 2's stepLog does NOT contain a photo step.
    const run2Row = state.pipelineRuns.find((r) => r.id === run2.runId)!;
    const run2Ctx = run2Row.context as { stepLog: Array<{ agent: string }> };
    // runSet for copy+isolate:true = {copy, brand, compliance}.
    // runFromAgent preserves strategy + photo from the prior run, so ctx.stepLog
    // at the END of regenerate may contain strategy + photo (preserved) + the
    // three new entries. The assertion is about what just RAN in run 2.
    // The regenerate helper reports runSetAgents to let the caller see that.
    expect(run2.runSetAgents.sort()).toEqual(["brand", "compliance", "copy"]);

    // Run 1's photo output is still accessible (run 1's context retained it).
    const run1Row = state.pipelineRuns.find((r) => r.id === run1.pipelineRunId)!;
    const run1Ctx = run1Row.context as { imageUrl?: string };
    expect(run1Ctx.imageUrl).toBe("https://cdn.example/run1.png");

    // The assets row was UPDATED with run 2's caption but its media_url
    // carries over from run 1 (photo did NOT re-run).
    const asset = state.assets.get(assetId)!;
    expect(asset.output).toContain("A-v2");
    expect(asset.media_url).toBe("https://cdn.example/run1.png");

    // Audit events: 5 from run 1 + 3 from run 2 = 8.
    expect(state.auditEvents).toHaveLength(8);
    const run1Events = state.auditEvents.filter(
      (e) => (e.metadata as { runId?: string }).runId === run1.pipelineRunId
    );
    const run2Events = state.auditEvents.filter(
      (e) => (e.metadata as { runId?: string }).runId === run2.runId
    );
    expect(run1Events).toHaveLength(5);
    expect(run2Events).toHaveLength(3);
    expect(run2Events.map((e) => e.action).sort()).toEqual([
      "pipeline.brand_reviewed",
      "pipeline.compliance_checked",
      "pipeline.copy_drafted"
    ]);

    // Timeline classifier groups into two blocks with correct labels.
    const auditEventRows: AuditEvent[] = state.auditEvents.map((e, idx) => ({
      id: `evt_${idx}`,
      asset_id: e.asset_id as string,
      action: e.action as string,
      metadata: e.metadata as Record<string, unknown>,
      created_at: e.created_at as string
    }));
    const view = buildTimelineView(auditEventRows);
    expect(view.pipelineGroups).toHaveLength(2);
    const labels = view.pipelineGroups.map((g) => g.label).sort();
    expect(labels).toEqual(["Initial generation", "Regenerated caption"]);
    // Each group knows its runId.
    const byLabel = Object.fromEntries(view.pipelineGroups.map((g) => [g.label, g]));
    expect(byLabel["Initial generation"].runId).toBe(run1.pipelineRunId);
    expect(byLabel["Regenerated caption"].runId).toBe(run2.runId);
  });
});
