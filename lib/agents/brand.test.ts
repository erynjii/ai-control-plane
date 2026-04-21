import { describe, expect, it } from "vitest";
import { runBrand } from "./brand";
import { buildConstraints } from "./constraints";
import { baseContext, stubRuntime } from "./test-utils";
import type { CaptionVariant, PipelineContext, StrategyBrief } from "./types";

const SAMPLE_BRIEF: StrategyBrief = {
  audience: "A",
  tone: "warm",
  contentPillar: "opening",
  cta: { type: "booking", text: "Book" },
  hashtagClusters: [],
  visualConcept: "spa",
  constraints: buildConstraints("instagram")
};

const VARIANTS: CaptionVariant[] = [
  { id: "post_test_v1", text: "First caption", hashtags: ["#a"] },
  { id: "post_test_v2", text: "Second caption", hashtags: ["#b"] }
];

function ctxWithVariants(): PipelineContext {
  return { ...baseContext(), brief: SAMPLE_BRIEF, variants: VARIANTS };
}

const REVIEWS_JSON = JSON.stringify({
  reviews: [
    {
      variantId: "post_test_v1",
      score: 82,
      flags: [
        { severity: "warning", code: "brand.vague_cta", message: "CTA could be more specific" }
      ]
    },
    { variantId: "post_test_v2", score: 64, flags: [] }
  ]
});

describe("runBrand", () => {
  it("attaches scores + flags to matching variants without mutating text", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: REVIEWS_JSON, model: "gpt-4.1-mini", inputTokens: 200, outputTokens: 150 })
    });

    const next = await runBrand(ctxWithVariants(), runtime);

    expect(next.variants?.[0]).toMatchObject({
      id: "post_test_v1",
      text: "First caption",
      brandScore: 82
    });
    expect(next.variants?.[0].brandFlags).toHaveLength(1);
    expect(next.variants?.[0].brandFlags?.[0].ref).toBe("post_test_v1");
    expect(next.variants?.[1].brandScore).toBe(64);
    // Top-level flags also include the per-variant flags for easy aggregation.
    expect(next.flags).toHaveLength(1);
    expect(next.flags[0]).toMatchObject({ agent: "brand", severity: "warning" });
    expect(next.stepLog[0]).toMatchObject({ agent: "brand", status: "ok" });
  });

  it("clamps score to 0-100 and rounds", async () => {
    const bad = JSON.stringify({
      reviews: [
        { variantId: "post_test_v1", score: 120.9, flags: [] },
        { variantId: "post_test_v2", score: -5, flags: [] }
      ]
    });
    const runtime = stubRuntime({
      chat: () => ({ text: bad, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 })
    });

    const next = await runBrand(ctxWithVariants(), runtime);
    expect(next.variants?.[0].brandScore).toBe(100);
    expect(next.variants?.[1].brandScore).toBe(0);
  });

  it("skips when variants are missing", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: "", model: "", inputTokens: 0, outputTokens: 0 })
    });
    const ctx = { ...baseContext(), brief: SAMPLE_BRIEF };
    const next = await runBrand(ctx, runtime);

    expect(next.stepLog[0].status).toBe("skipped");
    expect(next.flags[0].code).toBe("brand.missing_variants");
  });

  it("rejects invalid severity strings as errors", async () => {
    const bad = JSON.stringify({
      reviews: [
        {
          variantId: "post_test_v1",
          score: 80,
          flags: [{ severity: "critical", code: "x", message: "y" }]
        }
      ]
    });
    const runtime = stubRuntime({
      chat: () => ({ text: bad, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 })
    });

    const next = await runBrand(ctxWithVariants(), runtime);
    expect(next.stepLog[0].status).toBe("error");
    expect(next.flags[0].code).toBe("brand.error");
  });
});
