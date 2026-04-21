import { describe, expect, it } from "vitest";
import { runCompliance } from "./compliance";
import { buildConstraints } from "./constraints";
import { baseContext, stubRuntime } from "./test-utils";
import type { PipelineContext, StrategyBrief } from "./types";

const SAMPLE_BRIEF: StrategyBrief = {
  audience: "A",
  tone: "warm",
  contentPillar: "opening",
  cta: { type: "booking", text: "Book" },
  hashtagClusters: [],
  visualConcept: "spa",
  constraints: buildConstraints("instagram")
};

function ctxReadyForCompliance(): PipelineContext {
  return {
    ...baseContext(),
    brief: SAMPLE_BRIEF,
    variants: [
      { id: "post_test_v1", text: "Welcome to the grand opening.", hashtags: ["#HeadSpa"] },
      { id: "post_test_v2", text: "We promise guaranteed results.", hashtags: [] }
    ],
    selectedVariantId: "post_test_v1",
    imageUrl: "https://cdn.example/img.png"
  };
}

const NO_ISSUES_JSON = JSON.stringify({ flags: [] });
const ONE_WARNING_JSON = JSON.stringify({
  flags: [
    { severity: "warning", code: "compliance.missing_disclaimer", message: "Add an #ad disclosure for partnerships." }
  ]
});

describe("runCompliance", () => {
  it("appends compliance flags to ctx.flags, never rewriting", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: ONE_WARNING_JSON, model: "gpt-4.1-mini", inputTokens: 120, outputTokens: 60 })
    });

    const next = await runCompliance(ctxReadyForCompliance(), runtime);

    expect(next.flags).toHaveLength(1);
    expect(next.flags[0]).toMatchObject({
      agent: "compliance",
      severity: "warning",
      code: "compliance.missing_disclaimer",
      ref: "post_test_v1"
    });
    // Variant text must be unchanged.
    expect(next.variants?.[0].text).toBe("Welcome to the grand opening.");
    expect(next.stepLog[0]).toMatchObject({ agent: "compliance", status: "ok" });
  });

  it("accepts an empty flags array as a clean run", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: NO_ISSUES_JSON, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 5 })
    });

    const next = await runCompliance(ctxReadyForCompliance(), runtime);
    expect(next.flags).toHaveLength(0);
    expect(next.stepLog[0].status).toBe("ok");
  });

  it("skips with a warning when no selectedVariantId is set", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: NO_ISSUES_JSON, model: "", inputTokens: 0, outputTokens: 0 })
    });
    const ctx = { ...baseContext(), brief: SAMPLE_BRIEF, variants: ctxReadyForCompliance().variants };
    const next = await runCompliance(ctx, runtime);

    expect(next.stepLog[0].status).toBe("skipped");
    expect(next.flags[0].code).toBe("compliance.missing_selection");
  });

  it("skips when selectedVariantId doesn't match any variant", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: NO_ISSUES_JSON, model: "", inputTokens: 0, outputTokens: 0 })
    });
    const ctx = { ...ctxReadyForCompliance(), selectedVariantId: "nope" };
    const next = await runCompliance(ctx, runtime);

    expect(next.stepLog[0].status).toBe("skipped");
    expect(next.flags[0].code).toBe("compliance.variant_not_found");
  });
});
