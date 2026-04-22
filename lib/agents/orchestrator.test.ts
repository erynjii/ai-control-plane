import { describe, expect, it } from "vitest";
import { AGENT_INVALIDATION_MAP, runFromAgent, runPipeline, runSetFor } from "./orchestrator";
import { stubRuntime } from "./test-utils";
import type { ChatRequest, ChatResponse, ImageRequest, ImageResponse } from "./runtime";
import type { AgentName, PipelineInit } from "./types";

const INIT: PipelineInit = {
  postId: "post_int",
  userPrompt: "Announce grand opening for a head spa in Miami.",
  workspaceId: "ws_int",
  connectedAccountId: "acct_ig_aurorabonita",
  platform: "instagram"
};

const STRATEGY_JSON = JSON.stringify({
  audience: "Miami wellness seekers",
  tone: "warm, grounded",
  contentPillar: "Grand opening",
  cta: { type: "booking", text: "Book your first ritual" },
  hashtagClusters: ["#HeadSpa", "#MiamiWellness"],
  visualConcept: "Softly lit spa interior, warm wood tones",
  optimalPostTime: ""
});

const COPY_JSON = JSON.stringify({
  variants: [
    { text: "We’re open — your scalp ritual awaits.", hashtags: ["#HeadSpa"] },
    { text: "Miami, meet your new oasis.", hashtags: ["#MiamiWellness", "#HeadSpa"] }
  ]
});

const BRAND_JSON_HIGHER_FIRST = JSON.stringify({
  reviews: [
    { variantId: "post_int_v1", score: 88, flags: [] },
    { variantId: "post_int_v2", score: 71, flags: [] }
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
    imageUrl: "https://cdn.example/int.png",
    model: "gpt-image-1",
    costUsd: 0.04
  });
}

describe("runPipeline", () => {
  it("runs Strategy, then Copy+Photo in parallel, Brand, auto-select, Compliance in order", async () => {
    const callOrder: string[] = [];
    // Copy and Photo each sleep ~50ms so their execution windows are wide
    // enough for the overlap assertion below to reliably detect the
    // difference between Promise.all and sequential awaits.
    const PARALLEL_DELAY_MS = 50;
    const runtime = stubRuntime({
      chat: chatByAgent({
        strategy: async (req) => {
          callOrder.push(req.agent);
          return { text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 100, outputTokens: 80 };
        },
        copy: async (req) => {
          callOrder.push(req.agent);
          await new Promise((resolve) => setTimeout(resolve, PARALLEL_DELAY_MS));
          return { text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 200, outputTokens: 120 };
        },
        brand: async (req) => {
          callOrder.push(req.agent);
          return {
            text: BRAND_JSON_HIGHER_FIRST,
            model: "gpt-4.1-mini",
            inputTokens: 150,
            outputTokens: 60
          };
        },
        compliance: async (req) => {
          callOrder.push(req.agent);
          return { text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 80, outputTokens: 10 };
        }
      }),
      image: async (req) => {
        callOrder.push(req.agent);
        await new Promise((resolve) => setTimeout(resolve, PARALLEL_DELAY_MS));
        return { imageUrl: "https://cdn.example/int.png", model: "gpt-image-1", costUsd: 0.04 };
      }
    });

    const ctx = await runPipeline(INIT, runtime);

    // Strategy runs first. Copy and Photo both run before Brand. Brand before
    // Compliance. Assert the relative ordering (not the copy/photo order).
    const strategyIdx = callOrder.indexOf("strategy");
    const copyIdx = callOrder.indexOf("copy");
    const photoIdx = callOrder.indexOf("photo");
    const brandIdx = callOrder.indexOf("brand");
    const complianceIdx = callOrder.indexOf("compliance");
    expect(strategyIdx).toBe(0);
    expect(copyIdx).toBeGreaterThan(strategyIdx);
    expect(photoIdx).toBeGreaterThan(strategyIdx);
    expect(brandIdx).toBeGreaterThan(Math.max(copyIdx, photoIdx));
    expect(complianceIdx).toBeGreaterThan(brandIdx);

    // Execution-window overlap: proves Copy and Photo ran concurrently, not
    // sequentially. If Promise.all were accidentally replaced with back-to-back
    // awaits, one of these two inequalities would fail because the windows
    // would be disjoint. Together they are the Allen-interval "overlaps"
    // predicate — disjoint ranges violate at least one.
    const copyLog = ctx.stepLog.find((s) => s.agent === "copy");
    const photoLog = ctx.stepLog.find((s) => s.agent === "photo");
    expect(copyLog).toBeDefined();
    expect(photoLog).toBeDefined();
    const copyStart = Date.parse(copyLog!.startedAt);
    const copyEnd = Date.parse(copyLog!.finishedAt);
    const photoStart = Date.parse(photoLog!.startedAt);
    const photoEnd = Date.parse(photoLog!.finishedAt);
    expect(copyStart).toBeLessThan(photoEnd);
    expect(photoStart).toBeLessThan(copyEnd);

    // Final context shape.
    expect(ctx.brief?.audience).toBeTruthy();
    expect(ctx.variants).toHaveLength(2);
    expect(ctx.imageUrl).toBe("https://cdn.example/int.png");
    expect(ctx.selectedVariantId).toBe("post_int_v1"); // highest brandScore
    expect(ctx.stepLog.map((s) => s.agent)).toEqual([
      "strategy",
      "copy",
      "photo",
      "brand",
      "compliance"
    ]);
    expect(ctx.stepLog.every((s) => s.status === "ok")).toBe(true);
  });

  it("auto-selects the highest-scoring variant even when the second variant wins", async () => {
    const brandSecondWins = JSON.stringify({
      reviews: [
        { variantId: "post_int_v1", score: 40, flags: [] },
        { variantId: "post_int_v2", score: 95, flags: [] }
      ]
    });
    const runtime = stubRuntime({
      chat: chatByAgent({
        strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 50, outputTokens: 50 }),
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 50, outputTokens: 50 }),
        brand: () => ({ text: brandSecondWins, model: "gpt-4.1-mini", inputTokens: 50, outputTokens: 30 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 20, outputTokens: 5 })
      }),
      image: defaultImage()
    });

    const ctx = await runPipeline(INIT, runtime);
    expect(ctx.selectedVariantId).toBe("post_int_v2");
  });

  it("continues past an agent error instead of throwing", async () => {
    const runtime = stubRuntime({
      chat: chatByAgent({
        strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 50, outputTokens: 50 }),
        copy: () => {
          throw new Error("copy 500");
        },
        brand: () => ({ text: BRAND_JSON_HIGHER_FIRST, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 })
      }),
      image: defaultImage()
    });

    const ctx = await runPipeline(INIT, runtime);

    expect(ctx.stepLog.find((s) => s.agent === "copy")?.status).toBe("error");
    // Brand should skip (no variants) rather than throw.
    expect(ctx.stepLog.find((s) => s.agent === "brand")?.status).toBe("skipped");
    // Photo succeeded in parallel, so imageUrl is still set.
    expect(ctx.imageUrl).toBe("https://cdn.example/int.png");
    // At least one "copy.error" flag is present.
    expect(ctx.flags.some((f) => f.code === "copy.error")).toBe(true);
  });

  it("trips the cost cap and appends a pipeline.cost_cap_exceeded flag", async () => {
    // Strategy alone will exceed the 0.01 cap at gpt-4.1-mini rates if we use
    // enough tokens; 1M input * 0.15 = $0.15.
    const runtime = stubRuntime({
      chat: chatByAgent({
        strategy: () => ({
          text: STRATEGY_JSON,
          model: "gpt-4.1-mini",
          inputTokens: 1_000_000,
          outputTokens: 0
        }),
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 }),
        brand: () => ({ text: BRAND_JSON_HIGHER_FIRST, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 })
      }),
      image: defaultImage()
    });

    const ctx = await runPipeline(INIT, runtime, { costCapUsd: 0.01 });

    expect(ctx.flags.some((f) => f.code === "pipeline.cost_cap_exceeded")).toBe(true);
    // Only strategy's step log should exist — other agents skipped.
    expect(ctx.stepLog.map((s) => s.agent)).toEqual(["strategy"]);
    expect(ctx.variants).toBeUndefined();
    expect(ctx.imageUrl).toBeUndefined();
  });
});

describe("runFromAgent", () => {
  function baselineRuntime() {
    return stubRuntime({
      chat: chatByAgent({
        strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        brand: () => ({ text: BRAND_JSON_HIGHER_FIRST, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
      }),
      image: defaultImage()
    });
  }

  it("re-runs from 'photo' onward without touching strategy or copy output", async () => {
    const firstRun = await runPipeline(INIT, baselineRuntime());
    const originalBrief = firstRun.brief;
    const originalVariants = firstRun.variants;

    let photoCalls = 0;
    const rerunRuntime = stubRuntime({
      chat: chatByAgent({
        // strategy/copy should NOT be re-called; provide them as failures so
        // we notice if they are.
        strategy: () => {
          throw new Error("strategy should not run on rerun");
        },
        copy: () => {
          throw new Error("copy should not run on rerun");
        },
        brand: () => ({
          text: BRAND_JSON_HIGHER_FIRST,
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
      image: async () => {
        photoCalls += 1;
        return { imageUrl: "https://cdn.example/new.png", model: "gpt-image-1", costUsd: 0.04 };
      }
    });

    const rerun = await runFromAgent(firstRun, "photo", rerunRuntime);

    expect(photoCalls).toBe(1);
    expect(rerun.imageUrl).toBe("https://cdn.example/new.png");
    // Brief + variants preserved.
    expect(rerun.brief).toEqual(originalBrief);
    // Copy text unchanged; but brand re-ran so scores exist again.
    expect(rerun.variants?.[0].text).toBe(originalVariants?.[0].text);
    // stepLog for strategy + copy preserved from the original run.
    const strategyEntries = rerun.stepLog.filter((s) => s.agent === "strategy");
    const copyEntries = rerun.stepLog.filter((s) => s.agent === "copy");
    expect(strategyEntries).toHaveLength(1);
    expect(copyEntries).toHaveLength(1);
    // Photo+brand+compliance each have exactly one entry (the re-run).
    expect(rerun.stepLog.filter((s) => s.agent === "photo")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "brand")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "compliance")).toHaveLength(1);
  });
});

describe("runSetFor + AGENT_INVALIDATION_MAP", () => {
  // Encodes the exact dependency graph the product requires. If a future
  // agent is added to AGENT_INVALIDATION_MAP, these cases force a decision
  // rather than silently picking up the new agent.
  const AGENTS: AgentName[] = ["strategy", "copy", "photo", "brand", "compliance"];

  function sorted(set: Set<AgentName>): AgentName[] {
    return Array.from(set).sort();
  }

  it("isolate=false reproduces the legacy slice behavior (from → end of order)", () => {
    expect(sorted(runSetFor("strategy", false))).toEqual(sorted(new Set(AGENTS)));
    expect(sorted(runSetFor("copy", false))).toEqual(
      sorted(new Set<AgentName>(["copy", "photo", "brand", "compliance"]))
    );
    expect(sorted(runSetFor("photo", false))).toEqual(
      sorted(new Set<AgentName>(["photo", "brand", "compliance"]))
    );
    expect(sorted(runSetFor("brand", false))).toEqual(
      sorted(new Set<AgentName>(["brand", "compliance"]))
    );
    expect(sorted(runSetFor("compliance", false))).toEqual(
      sorted(new Set<AgentName>(["compliance"]))
    );
  });

  it("isolate=true traverses the explicit dependency graph", () => {
    // strategy invalidates everything downstream.
    expect(sorted(runSetFor("strategy", true))).toEqual(sorted(new Set(AGENTS)));
    // copy invalidates brand + compliance (NOT photo).
    expect(sorted(runSetFor("copy", true))).toEqual(
      sorted(new Set<AgentName>(["copy", "brand", "compliance"]))
    );
    // photo invalidates compliance only (NOT copy, NOT brand).
    expect(sorted(runSetFor("photo", true))).toEqual(
      sorted(new Set<AgentName>(["photo", "compliance"]))
    );
    // brand invalidates compliance.
    expect(sorted(runSetFor("brand", true))).toEqual(
      sorted(new Set<AgentName>(["brand", "compliance"]))
    );
    // compliance invalidates nothing downstream.
    expect(sorted(runSetFor("compliance", true))).toEqual(
      sorted(new Set<AgentName>(["compliance"]))
    );
  });

  it("invalidation map entries are each subsets of AGENTS and don't include their own key", () => {
    for (const agent of AGENTS) {
      const downstream = AGENT_INVALIDATION_MAP[agent];
      for (const d of downstream) {
        expect(AGENTS).toContain(d);
        expect(d).not.toBe(agent);
      }
    }
  });
});

describe("runFromAgent isolate=true behavior", () => {
  function baselineRuntime() {
    return stubRuntime({
      chat: chatByAgent({
        strategy: () => ({ text: STRATEGY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        brand: () => ({ text: BRAND_JSON_HIGHER_FIRST, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
      }),
      image: defaultImage()
    });
  }

  it("isolate copy: re-runs copy + brand + compliance; does NOT touch photo output", async () => {
    const firstRun = await runPipeline(INIT, baselineRuntime());
    const originalImageUrl = firstRun.imageUrl;
    const originalImagePrompt = firstRun.imagePrompt;

    let photoCalls = 0;
    const rerunRuntime = stubRuntime({
      chat: chatByAgent({
        strategy: () => {
          throw new Error("strategy should not run on isolated copy re-run");
        },
        copy: () => ({ text: COPY_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        brand: () => ({ text: BRAND_JSON_HIGHER_FIRST, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 }),
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
      }),
      image: async () => {
        photoCalls += 1;
        return { imageUrl: "should-not-be-used", model: "gpt-image-1", costUsd: 0.04 };
      }
    });

    const rerun = await runFromAgent(firstRun, "copy", rerunRuntime, { isolate: true });

    // Photo was NOT re-run.
    expect(photoCalls).toBe(0);
    expect(rerun.imageUrl).toBe(originalImageUrl);
    expect(rerun.imagePrompt).toBe(originalImagePrompt);

    // Copy + brand + compliance each have exactly one entry (the re-run).
    expect(rerun.stepLog.filter((s) => s.agent === "copy")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "brand")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "compliance")).toHaveLength(1);
    // Strategy + photo entries preserved from the original run.
    expect(rerun.stepLog.filter((s) => s.agent === "strategy")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "photo")).toHaveLength(1);
  });

  it("isolate photo: re-runs photo + compliance; does NOT touch copy or brand outputs", async () => {
    const firstRun = await runPipeline(INIT, baselineRuntime());
    const originalVariants = firstRun.variants;
    const originalSelectedId = firstRun.selectedVariantId;
    const originalFirstScore = firstRun.variants?.[0].brandScore;

    const rerunRuntime = stubRuntime({
      chat: chatByAgent({
        strategy: () => {
          throw new Error("strategy should not run on isolated photo re-run");
        },
        copy: () => {
          throw new Error("copy should not run on isolated photo re-run");
        },
        brand: () => {
          throw new Error("brand should not run on isolated photo re-run");
        },
        compliance: () => ({ text: COMPLIANCE_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 })
      }),
      image: async () => ({ imageUrl: "https://cdn.example/new.png", model: "gpt-image-1", costUsd: 0.04 })
    });

    const rerun = await runFromAgent(firstRun, "photo", rerunRuntime, { isolate: true });

    expect(rerun.imageUrl).toBe("https://cdn.example/new.png");
    // Variants + brand scores preserved.
    expect(rerun.variants?.[0].text).toBe(originalVariants?.[0].text);
    expect(rerun.variants?.[0].brandScore).toBe(originalFirstScore);
    expect(rerun.selectedVariantId).toBe(originalSelectedId);

    // Only photo + compliance re-ran.
    expect(rerun.stepLog.filter((s) => s.agent === "photo")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "compliance")).toHaveLength(1);
    expect(rerun.stepLog.filter((s) => s.agent === "copy")).toHaveLength(1); // preserved
    expect(rerun.stepLog.filter((s) => s.agent === "brand")).toHaveLength(1); // preserved
    expect(rerun.stepLog.filter((s) => s.agent === "strategy")).toHaveLength(1); // preserved
  });
});
