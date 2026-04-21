import { describe, expect, it } from "vitest";
import { buildConstraints } from "./constraints";
import { runCopy } from "./copy";
import { baseContext, stubRuntime } from "./test-utils";
import type { PipelineContext, StrategyBrief } from "./types";

const SAMPLE_BRIEF: StrategyBrief = {
  audience: "Wellness-curious adults in Miami",
  tone: "warm, celebratory",
  contentPillar: "Grand opening",
  cta: { type: "booking", text: "Book your first ritual" },
  hashtagClusters: ["#HeadSpa", "#MiamiWellness"],
  visualConcept: "Softly lit spa interior, warm wood tones.",
  constraints: buildConstraints("instagram")
};

function ctxWithBrief(): PipelineContext {
  return { ...baseContext(), brief: SAMPLE_BRIEF };
}

const OK_COPY_JSON = JSON.stringify({
  variants: [
    { text: "We’re open! Come in for a grounding scalp ritual.", hashtags: ["#HeadSpa"] },
    { text: "Your scalp called. It wants the full ritual.", hashtags: ["#MiamiWellness", "#HeadSpa"] }
  ]
});

describe("runCopy", () => {
  it("returns 2+ variants seeded with ids and appends an ok step log", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: OK_COPY_JSON, model: "gpt-4.1-mini", inputTokens: 300, outputTokens: 220 })
    });

    const next = await runCopy(ctxWithBrief(), runtime);

    expect(next.variants).toHaveLength(2);
    expect(next.variants?.[0].id).toMatch(/^post_test_v\d+$/);
    expect(next.variants?.[0].text).toBeTruthy();
    expect(next.stepLog).toHaveLength(1);
    expect(next.stepLog[0]).toMatchObject({ agent: "copy", status: "ok" });
  });

  it("skips and flags a blocker when brief is missing (upstream failure)", async () => {
    const runtime = stubRuntime({ chat: () => ({ text: "", model: "", inputTokens: 0, outputTokens: 0 }) });
    const next = await runCopy(baseContext(), runtime);

    expect(next.variants).toBeUndefined();
    expect(next.stepLog).toHaveLength(1);
    expect(next.stepLog[0].status).toBe("skipped");
    expect(next.flags).toHaveLength(1);
    expect(next.flags[0]).toMatchObject({ agent: "copy", severity: "blocker", code: "copy.missing_brief" });
  });

  it("rejects model output with the wrong variant count", async () => {
    const bad = JSON.stringify({
      variants: [{ text: "only one", hashtags: [] }]
    });
    const runtime = stubRuntime({
      chat: () => ({ text: bad, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 5 })
    });

    const next = await runCopy(ctxWithBrief(), runtime);

    expect(next.variants).toBeUndefined();
    expect(next.stepLog[0].status).toBe("error");
    expect(next.flags[0].code).toBe("copy.error");
  });

  it("passes platform limits into the system prompt", async () => {
    let captured: string | null = null;
    const runtime = stubRuntime({
      chat: (req) => {
        captured = req.system;
        return { text: OK_COPY_JSON, model: "gpt-4.1-mini", inputTokens: 1, outputTokens: 1 };
      }
    });

    await runCopy(ctxWithBrief(), runtime);
    expect(captured).toContain("Max 2200 characters");
    expect(captured).toContain("At most 30 hashtags");
  });
});
