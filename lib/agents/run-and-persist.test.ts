import { describe, expect, it } from "vitest";
import { runAndPersistPipeline } from "./run-and-persist";
import type { PersistSupabase } from "./persist";
import { stubRuntime } from "./test-utils";
import type { ChatRequest, ChatResponse, ImageRequest, ImageResponse } from "./runtime";
import type { PipelineInit } from "./types";

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
const BRAND_JSON = JSON.stringify({
  reviews: [
    { variantId: "post_rap_v1", score: 88, flags: [] },
    { variantId: "post_rap_v2", score: 71, flags: [] }
  ]
});
const COMPLIANCE_JSON = JSON.stringify({ flags: [] });

type ChatHandler = (req: ChatRequest) => ChatResponse | Promise<ChatResponse>;

function chatByAgent(handlers: Partial<Record<string, ChatHandler>>): ChatHandler {
  return (req) => {
    const handler = handlers[req.agent];
    if (!handler) throw new Error(`no chat handler for agent ${req.agent}`);
    return handler(req);
  };
}

function defaultImage(): (req: ImageRequest) => ImageResponse {
  return () => ({
    imageUrl: "https://cdn/x.png",
    model: "gpt-image-1",
    costUsd: 0.04
  });
}

const INIT: PipelineInit = {
  postId: "post_rap",
  userPrompt: "Announce grand opening.",
  workspaceId: "ws_rap",
  connectedAccountId: "acct_ig",
  platform: "instagram"
};

interface FakeSupabaseOptions {
  assetId?: string;
  assetsError?: Error;
  auditError?: Error;
}

function fakeSupabase(options: FakeSupabaseOptions = {}): {
  supabase: PersistSupabase;
  inserts: Array<{ table: string; row: unknown }>;
} {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const assetId = options.assetId ?? "asset_xyz";
  const supabase: PersistSupabase = {
    from(table) {
      return {
        insert(row: unknown) {
          inserts.push({ table, row });
          if (table === "assets") {
            const chain = {
              select: () => ({
                single: async () => ({
                  data: options.assetsError ? null : ({ id: assetId, output: "selected caption" } as never),
                  error: options.assetsError ?? null
                })
              })
            };
            return Object.assign(Promise.resolve({ error: null }), chain);
          }
          if (table === "audit_events") {
            return Object.assign(
              Promise.resolve({ error: options.auditError ?? null }),
              {
                select: () => ({ single: async () => ({ data: null, error: null }) })
              }
            );
          }
          return Object.assign(Promise.resolve({ error: null }), {
            select: () => ({ single: async () => ({ data: null, error: null }) })
          });
        }
      };
    }
  };
  return { supabase, inserts };
}

function happyRuntime() {
  return stubRuntime({
    chat: chatByAgent({
      strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      brand: () => ({ text: BRAND_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
      compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
    }),
    image: defaultImage()
  });
}

describe("runAndPersistPipeline", () => {
  it("happy path: inserts assets, pipeline_runs, and batched audit_events in order", async () => {
    const { supabase, inserts } = fakeSupabase();
    const result = await runAndPersistPipeline({
      supabase,
      runtime: happyRuntime(),
      init: INIT,
      userId: "user_1",
      workspaceId: "ws_rap",
      connectedAccountId: null,
      conversationId: "conv_1",
      prompt: "Announce."
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.asset.id).toBe("asset_xyz");
    expect(result.ctx.selectedVariantId).toBe("post_rap_v1");
    expect(result.auditEventCount).toBe(5);
    expect(result.auditError).toBeUndefined();
    expect(typeof result.pipelineRunId).toBe("string");
    expect(result.pipelineRunId.length).toBeGreaterThan(0);

    expect(inserts.map((i) => i.table)).toEqual(["assets", "pipeline_runs", "audit_events"]);

    // The pipeline_runs row carries the same id that run-and-persist generated.
    const runInsert = inserts[1].row as { id: string };
    expect(runInsert.id).toBe(result.pipelineRunId);

    // audit_events insert is a single batch call (one array, not 5 separate)
    // and every row references the same runId.
    const auditInsert = inserts[2];
    expect(Array.isArray(auditInsert.row)).toBe(true);
    const auditRows = auditInsert.row as Array<{ metadata: { runId: string } }>;
    expect(auditRows).toHaveLength(5);
    expect(auditRows.every((r) => r.metadata.runId === result.pipelineRunId)).toBe(true);
  });

  it("short-circuits when the pipeline fails to produce a variant (no persist, no audit)", async () => {
    // Cost cap trips after strategy; no variants, no image.
    const tightCap = stubRuntime({
      chat: chatByAgent({
        strategy: () => ({
          text: STRATEGY_JSON,
          model: "gpt-4.1-mini",
          inputTokens: 1_000_000,
          outputTokens: 0
        }),
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 }),
        brand: () => ({ text: BRAND_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 })
      }),
      image: defaultImage()
    });

    const { supabase, inserts } = fakeSupabase();
    const result = await runAndPersistPipeline({
      supabase,
      runtime: tightCap,
      init: INIT,
      userId: "user_1",
      workspaceId: "ws_rap",
      connectedAccountId: null,
      conversationId: null,
      prompt: "Announce.",
      orchestratorOptions: { costCapUsd: 0.01 }
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("pipeline_incomplete");
    expect(inserts).toHaveLength(0);
    // stepLog still has strategy entry so the caller can still inspect what happened.
    expect(result.ctx.stepLog.some((s) => s.agent === "strategy")).toBe(true);
  });

  it("returns persist_failed when the assets insert errors (no audit writes)", async () => {
    const { supabase, inserts } = fakeSupabase({ assetsError: new Error("RLS denied") });
    const result = await runAndPersistPipeline({
      supabase,
      runtime: happyRuntime(),
      init: INIT,
      userId: "user_1",
      workspaceId: "ws_rap",
      connectedAccountId: null,
      conversationId: null,
      prompt: "Announce."
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("persist_failed");
    // Attempt hit assets, never reached audit_events.
    expect(inserts.some((i) => i.table === "audit_events")).toBe(false);
  });

  it("returns ok:true with auditError populated when the audit batch insert fails", async () => {
    const { supabase } = fakeSupabase({ auditError: new Error("timeout") });
    const result = await runAndPersistPipeline({
      supabase,
      runtime: happyRuntime(),
      init: INIT,
      userId: "user_1",
      workspaceId: "ws_rap",
      connectedAccountId: null,
      conversationId: null,
      prompt: "Announce."
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.asset.id).toBe("asset_xyz");
    expect(result.auditEventCount).toBe(5);
    expect(result.auditError).toBeInstanceOf(Error);
  });
});
