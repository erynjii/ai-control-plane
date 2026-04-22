import { describe, expect, it } from "vitest";
import {
  buildAssetInsert,
  buildPipelineRunInsert,
  persistPipelineResult,
  type PersistParams,
  type PersistSupabase
} from "./persist";
import type { PipelineContext } from "./types";

// v1 row shape lifted from /api/generate-post/route.ts v1 branch. If this
// grows a field (e.g. a new column in a future migration), updating it here
// is the forcing function that tells v2 to follow suit.
const V1_ASSET_COLUMNS = [
  "workspace_id",
  "user_id",
  "prompt",
  "system_prompt",
  "output",
  "model",
  "status",
  "risk_level",
  "scan_findings",
  "promoted",
  "conversation_id",
  "media_type",
  "media_prompt",
  "created_at",
  "updated_at"
];

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    postId: "post_persist",
    userPrompt: "Announce grand opening.",
    workspaceId: "ws_test",
    connectedAccountId: "acct_ig",
    platform: "instagram",
    brief: undefined,
    variants: [
      { id: "post_persist_v1", text: "Selected caption", hashtags: ["#HeadSpa"], brandScore: 88 },
      { id: "post_persist_v2", text: "Runner-up", hashtags: [], brandScore: 71 }
    ],
    selectedVariantId: "post_persist_v1",
    imagePrompt: "A softly lit spa interior.",
    imageUrl: "https://cdn.example/img.png",
    flags: [{ agent: "brand", severity: "warning", code: "brand.cta", message: "Tighten CTA" }],
    stepLog: [
      {
        agent: "strategy",
        startedAt: "",
        finishedAt: "",
        model: "gpt-4.1-mini",
        inputTokens: 100,
        outputTokens: 80,
        costUsd: 0.05,
        status: "ok"
      },
      {
        agent: "copy",
        startedAt: "",
        finishedAt: "",
        model: "gpt-4.1-mini",
        inputTokens: 200,
        outputTokens: 120,
        costUsd: 0.1,
        status: "ok"
      },
      {
        agent: "photo",
        startedAt: "",
        finishedAt: "",
        model: "gpt-image-1",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0.04,
        status: "ok"
      }
    ],
    ...overrides
  };
}

function params(ctx: PipelineContext = makeCtx()): PersistParams {
  return {
    userId: "user_test",
    workspaceId: "ws_test",
    connectedAccountId: "acct_ig",
    conversationId: "conv_test",
    prompt: "Announce grand opening.",
    ctx,
    durationMs: 4200,
    runId: "run_test",
    now: "2026-04-21T00:00:00.000Z"
  };
}

describe("buildAssetInsert", () => {
  it("covers every column the v1 path inserts", () => {
    const row = buildAssetInsert(params());
    for (const column of V1_ASSET_COLUMNS) {
      expect(row, `missing column: ${column}`).toHaveProperty(column);
    }
  });

  it("uses the selected variant's text as output and the pipeline imageUrl", () => {
    const row = buildAssetInsert(params());
    expect(row.output).toBe("Selected caption");
    expect(row.media_url).toBe("https://cdn.example/img.png");
    expect(row.media_prompt).toBe("A softly lit spa interior.");
    expect(row.media_type).toBe("image");
  });

  it("throws when the orchestrator failed to select a variant", () => {
    const ctx = makeCtx({ selectedVariantId: undefined });
    expect(() => buildAssetInsert(params(ctx))).toThrow(/did not select/);
  });

  it("throws when no image was produced", () => {
    const ctx = makeCtx({ imageUrl: undefined });
    expect(() => buildAssetInsert(params(ctx))).toThrow(/did not produce an image/);
  });

  it("picks the Copy agent's model for the assets.model column", () => {
    const row = buildAssetInsert(params());
    expect(row.model).toBe("gpt-4.1-mini");
  });
});

describe("buildPipelineRunInsert", () => {
  it("aggregates cost across all step logs and picks up max flag severity", () => {
    const row = buildPipelineRunInsert(params(), "asset_abc");
    expect(row.id).toBe("run_test");
    expect(row.asset_id).toBe("asset_abc");
    expect(row.total_cost_usd).toBeCloseTo(0.19, 4); // 0.05 + 0.1 + 0.04
    expect(row.max_flag_severity).toBe("warning");
    expect(row.duration_ms).toBe(4200);
    expect(row.connected_account_id).toBe("acct_ig");
    expect(row.context).toBeTruthy();
  });

  it("records one model_versions entry per agent that ran", () => {
    const row = buildPipelineRunInsert(params(), "asset_abc");
    expect(row.model_versions).toMatchObject({
      strategy: "gpt-4.1-mini",
      copy: "gpt-4.1-mini",
      photo: "gpt-image-1"
    });
  });

  it("leaves max_flag_severity null when no flags were emitted", () => {
    const ctx = makeCtx({ flags: [] });
    const row = buildPipelineRunInsert(params(ctx), "asset_abc");
    expect(row.max_flag_severity).toBeNull();
  });
});

describe("persistPipelineResult", () => {
  it("inserts into assets then pipeline_runs using the returned asset id", async () => {
    const inserts: Array<{ table: string; row: unknown }> = [];
    const fakeAsset = { id: "asset_from_db" };
    const supabase: PersistSupabase = {
      from(table) {
        return {
          insert(row: unknown) {
            inserts.push({ table, row });
            const chain = {
              select: () => ({
                single: async () => ({ data: fakeAsset as never, error: null })
              })
            };
            return Object.assign(Promise.resolve({ error: null }), chain);
          }
        };
      }
    };

    const result = await persistPipelineResult(supabase, params());
    expect(result.asset.id).toBe("asset_from_db");
    expect(result.pipelineRunId).toBe("run_test");
    expect(inserts.map((i) => i.table)).toEqual(["assets", "pipeline_runs"]);
    expect((inserts[1].row as { asset_id: string }).asset_id).toBe("asset_from_db");
    expect((inserts[1].row as { id: string }).id).toBe("run_test");
  });

  it("throws when the assets insert errors", async () => {
    const supabase: PersistSupabase = {
      from() {
        return {
          insert() {
            const chain = {
              select: () => ({
                single: async () => ({ data: null, error: new Error("boom") })
              })
            };
            return Object.assign(Promise.resolve({ error: null }), chain);
          }
        };
      }
    };
    await expect(persistPipelineResult(supabase, params())).rejects.toThrow(/Failed to insert asset/);
  });
});
