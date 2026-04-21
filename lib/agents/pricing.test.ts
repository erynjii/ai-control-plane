import { describe, expect, it } from "vitest";
import { costFor, imageCost } from "./pricing";

describe("costFor", () => {
  it("prices gpt-4.1 at 3/12 per million tokens", () => {
    const cost = costFor({ model: "gpt-4.1", inputTokens: 1_000_000, outputTokens: 500_000 });
    // 1M input * $3 + 0.5M output * $12 = 3 + 6 = 9
    expect(cost).toBeCloseTo(9, 6);
  });

  it("prices gpt-4.1-mini at 0.15/0.6 per million tokens", () => {
    const cost = costFor({ model: "gpt-4.1-mini", inputTokens: 2_000_000, outputTokens: 1_000_000 });
    // 2M * 0.15 + 1M * 0.6 = 0.30 + 0.60 = 0.90
    expect(cost).toBeCloseTo(0.9, 6);
  });

  it("falls back to a conservative rate for unknown models", () => {
    const cost = costFor({ model: "unknown-model-vNext", inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost).toBeGreaterThan(0);
  });

  it("returns 0 when no tokens were used", () => {
    expect(costFor({ model: "gpt-4.1", inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("imageCost", () => {
  it("prices gpt-image-1 at the flat per-image rate", () => {
    expect(imageCost({ model: "gpt-image-1" })).toBeCloseTo(0.04, 6);
  });

  it("falls back for unknown models", () => {
    expect(imageCost({ model: "unknown-image" })).toBeGreaterThan(0);
  });
});
