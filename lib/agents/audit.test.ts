import { describe, expect, it } from "vitest";
import {
  buildPipelineAuditInserts,
  isPipelineAuditAction,
  PIPELINE_AUDIT_ACTIONS,
  pipelineActionForAgent
} from "./audit";
import type { AgentFlag, AgentStepLog, PipelineContext } from "./types";

function step(overrides: Partial<AgentStepLog>): AgentStepLog {
  return {
    agent: "strategy",
    startedAt: "2026-04-22T00:00:00.000Z",
    finishedAt: "2026-04-22T00:00:01.000Z",
    model: "gpt-4.1-mini",
    inputTokens: 10,
    outputTokens: 10,
    costUsd: 0.01,
    status: "ok",
    ...overrides
  };
}

function cleanCtx(stepLog: AgentStepLog[], flags: AgentFlag[] = []): PipelineContext {
  return {
    postId: "post_x",
    userPrompt: "",
    workspaceId: "ws",
    connectedAccountId: null,
    platform: "instagram",
    brief: {
      audience: "a",
      tone: "warm",
      contentPillar: "opening",
      cta: { type: "booking", text: "Book" },
      hashtagClusters: [],
      visualConcept: "spa",
      constraints: {
        bannedWords: [],
        requiredDisclaimers: [],
        platformLimits: { maxChars: 2200, maxHashtags: 30 }
      }
    },
    variants: [
      { id: "v1", text: "a", hashtags: [], brandScore: 82, brandFlags: [] },
      { id: "v2", text: "b", hashtags: [], brandScore: 71, brandFlags: [] }
    ],
    selectedVariantId: "v1",
    imageUrl: "https://cdn/x.png",
    imagePrompt: "prompt",
    flags,
    stepLog
  };
}

describe("pipelineActionForAgent", () => {
  it("maps every AgentName to exactly one pipeline.* action", () => {
    const agents = ["strategy", "copy", "brand", "photo", "compliance"] as const;
    const actions = agents.map((agent) => pipelineActionForAgent(agent));
    expect(new Set(actions).size).toBe(agents.length);
    for (const action of actions) {
      expect(PIPELINE_AUDIT_ACTIONS).toContain(action);
    }
  });
});

describe("isPipelineAuditAction", () => {
  it("accepts the five known pipeline.* strings", () => {
    for (const action of PIPELINE_AUDIT_ACTIONS) {
      expect(isPipelineAuditAction(action)).toBe(true);
    }
  });

  it("rejects lifecycle actions and unknown strings", () => {
    expect(isPipelineAuditAction("queued")).toBe(false);
    expect(isPipelineAuditAction("publish_started")).toBe(false);
    expect(isPipelineAuditAction("pipeline.unknown")).toBe(false);
    expect(isPipelineAuditAction("")).toBe(false);
  });
});

describe("buildPipelineAuditInserts", () => {
  const BASE_STEPS: AgentStepLog[] = [
    step({ agent: "strategy", finishedAt: "2026-04-22T00:00:01.000Z", costUsd: 0.05 }),
    step({ agent: "copy", finishedAt: "2026-04-22T00:00:02.000Z", costUsd: 0.1 }),
    step({
      agent: "photo",
      finishedAt: "2026-04-22T00:00:02.500Z",
      costUsd: 0.04,
      model: "gpt-image-1"
    }),
    step({ agent: "brand", finishedAt: "2026-04-22T00:00:03.000Z", costUsd: 0.03 }),
    step({ agent: "compliance", finishedAt: "2026-04-22T00:00:04.000Z", costUsd: 0.02 })
  ];

  it("emits one row per completed stepLog entry (no extras for a clean 5-step run)", () => {
    const rows = buildPipelineAuditInserts({
      assetId: "asset_1",
      userId: "user_1",
      ctx: cleanCtx(BASE_STEPS)
    });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.action)).toEqual([
      "pipeline.strategy_drafted",
      "pipeline.copy_drafted",
      "pipeline.image_generated",
      "pipeline.brand_reviewed",
      "pipeline.compliance_checked"
    ]);
    expect(rows.every((r) => r.asset_id === "asset_1")).toBe(true);
    expect(rows.every((r) => r.user_id === "user_1")).toBe(true);
  });

  it("populates metadata with the compact payload shape", () => {
    const rows = buildPipelineAuditInserts({
      assetId: "asset_1",
      userId: "user_1",
      ctx: cleanCtx(BASE_STEPS)
    });
    const strategyRow = rows.find((r) => r.action === "pipeline.strategy_drafted");
    expect(strategyRow?.metadata).toMatchObject({
      agent: "strategy",
      model: "gpt-4.1-mini",
      costUsd: 0.05
    });
    expect(strategyRow?.metadata.durationMs).toBe(1000); // 0s → 1s
    expect(typeof strategyRow?.metadata.summary).toBe("string");
    expect(strategyRow?.metadata.summary.length).toBeGreaterThan(0);
  });

  it("created_at follows finishedAt (monotonic for a normal run)", () => {
    const rows = buildPipelineAuditInserts({
      assetId: "asset_1",
      userId: "user_1",
      ctx: cleanCtx(BASE_STEPS)
    });
    const createdAts = rows.map((r) => Date.parse(r.created_at));
    const sorted = [...createdAts].sort((a, b) => a - b);
    expect(createdAts).toEqual(sorted);
  });

  it("still emits rows for error and skipped steps", () => {
    const steps: AgentStepLog[] = [
      step({ agent: "strategy" }),
      step({
        agent: "copy",
        status: "error",
        error: "copy 500",
        finishedAt: "2026-04-22T00:00:02.000Z"
      }),
      step({
        agent: "brand",
        status: "skipped",
        finishedAt: "2026-04-22T00:00:03.000Z"
      })
    ];
    const flags: AgentFlag[] = [
      { agent: "copy", severity: "warning", code: "copy.error", message: "copy 500" },
      { agent: "brand", severity: "blocker", code: "brand.missing_variants", message: "no variants" }
    ];

    const rows = buildPipelineAuditInserts({
      assetId: "asset_1",
      userId: "user_1",
      ctx: cleanCtx(steps, flags)
    });

    expect(rows).toHaveLength(3);
    expect(rows[1].metadata.summary).toBe("error: copy 500");
    expect(rows[2].metadata.summary).toBe("skipped: brand.missing_variants");
  });

  it("handles malformed timestamps by emitting durationMs=0", () => {
    const steps: AgentStepLog[] = [
      step({ agent: "strategy", startedAt: "nonsense", finishedAt: "also-nonsense" })
    ];
    const rows = buildPipelineAuditInserts({
      assetId: "asset_1",
      userId: "user_1",
      ctx: cleanCtx(steps)
    });
    expect(rows[0].metadata.durationMs).toBe(0);
  });

  it("returns [] when stepLog is empty", () => {
    const ctx = cleanCtx([]);
    const rows = buildPipelineAuditInserts({ assetId: "asset_1", userId: "user_1", ctx });
    expect(rows).toEqual([]);
  });
});
