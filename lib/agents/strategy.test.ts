import { describe, expect, it } from "vitest";
import { runStrategy } from "./strategy";
import { baseContext, stubRuntime } from "./test-utils";

const OK_STRATEGY_JSON = JSON.stringify({
  audience: "Wellness-curious adults in Miami",
  tone: "warm, celebratory, grounded",
  contentPillar: "Grand opening announcement",
  cta: { type: "booking", text: "Book your first scalp ritual" },
  hashtagClusters: ["#HeadSpa", "#MiamiWellness", "#GrandOpening"],
  visualConcept: "Softly lit spa interior with a single treatment chair, warm wood tones, natural greenery.",
  optimalPostTime: "Thu 7–9pm local"
});

describe("runStrategy", () => {
  it("populates brief with model output plus deterministic constraints and appends an ok step log", async () => {
    const runtime = stubRuntime({
      chat: () => ({
        text: OK_STRATEGY_JSON,
        model: "gpt-4.1-mini",
        inputTokens: 240,
        outputTokens: 180
      })
    });

    const next = await runStrategy(baseContext(), runtime);

    expect(next.brief?.audience).toContain("Miami");
    expect(next.brief?.visualConcept).toBeTruthy();
    // Constraints must come from the static table regardless of model output.
    expect(next.brief?.constraints.platformLimits).toEqual({ maxChars: 2200, maxHashtags: 30 });
    expect(Array.isArray(next.brief?.constraints.bannedWords)).toBe(true);
    expect(next.stepLog).toHaveLength(1);
    expect(next.stepLog[0]).toMatchObject({
      agent: "strategy",
      status: "ok",
      model: "gpt-4.1-mini",
      inputTokens: 240,
      outputTokens: 180
    });
    expect(next.stepLog[0].costUsd).toBeGreaterThan(0);
  });

  it("flags and step-logs an error when the runtime throws, never throws itself", async () => {
    const runtime = stubRuntime({
      chat: () => {
        throw new Error("upstream timeout");
      }
    });

    const next = await runStrategy(baseContext(), runtime);

    expect(next.brief).toBeUndefined();
    expect(next.stepLog).toHaveLength(1);
    expect(next.stepLog[0].status).toBe("error");
    expect(next.stepLog[0].error).toBe("upstream timeout");
    expect(next.flags).toHaveLength(1);
    expect(next.flags[0]).toMatchObject({ agent: "strategy", code: "strategy.error" });
  });

  it("flags when the model returns malformed JSON", async () => {
    const runtime = stubRuntime({
      chat: () => ({ text: "{not json", model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 5 })
    });

    const next = await runStrategy(baseContext(), runtime);

    expect(next.brief).toBeUndefined();
    expect(next.stepLog[0].status).toBe("error");
    expect(next.flags[0].code).toBe("strategy.error");
  });

  it("does not mutate the input context", async () => {
    const runtime = stubRuntime({
      chat: () => ({
        text: OK_STRATEGY_JSON,
        model: "gpt-4.1-mini",
        inputTokens: 1,
        outputTokens: 1
      })
    });

    const initial = baseContext();
    const snapshot = JSON.parse(JSON.stringify(initial));
    await runStrategy(initial, runtime);
    expect(initial).toEqual(snapshot);
  });
});
