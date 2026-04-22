import { describe, expect, it } from "vitest";
import { summarizeStep } from "./audit-summary";
import type { AgentFlag, AgentName, AgentStepLog, PipelineContext } from "./types";

function stepLog(overrides: Partial<AgentStepLog>): AgentStepLog {
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

function ctx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    postId: "p",
    userPrompt: "",
    workspaceId: "ws",
    connectedAccountId: null,
    platform: "instagram",
    flags: [],
    stepLog: [],
    ...overrides
  };
}

describe("summarizeStep", () => {
  describe("status wrappers", () => {
    it("returns 'error: <msg>' when step errored", () => {
      const step = stepLog({ status: "error", error: "upstream timeout" });
      expect(summarizeStep(step, ctx())).toBe("error: upstream timeout");
    });

    it("returns 'error: unknown' when step errored without a message", () => {
      const step = stepLog({ status: "error" });
      expect(summarizeStep(step, ctx())).toBe("error: unknown");
    });

    it("returns 'skipped: <flag code>' when skipped and a flag exists for that agent", () => {
      const step = stepLog({ agent: "copy", status: "skipped" });
      const flags: AgentFlag[] = [
        { agent: "copy", severity: "blocker", code: "copy.missing_brief", message: "x" }
      ];
      expect(summarizeStep(step, ctx({ flags }))).toBe("skipped: copy.missing_brief");
    });

    it("returns bare 'skipped' when skipped but no flag is attributable", () => {
      const step = stepLog({ agent: "copy", status: "skipped" });
      expect(summarizeStep(step, ctx())).toBe("skipped");
    });
  });

  describe("per-agent (status=ok)", () => {
    it("strategy: tone + pillar", () => {
      const step = stepLog({ agent: "strategy" });
      const result = summarizeStep(
        step,
        ctx({
          brief: {
            audience: "a",
            tone: "warm, grounded",
            contentPillar: "Grand opening",
            cta: { type: "booking", text: "Book" },
            hashtagClusters: [],
            visualConcept: "spa",
            constraints: {
              bannedWords: [],
              requiredDisclaimers: [],
              platformLimits: { maxChars: 2200, maxHashtags: 30 }
            }
          }
        })
      );
      expect(result).toContain("tone='warm, grounded'");
      expect(result).toContain("pillar='Grand opening'");
    });

    it("strategy: falls back when brief missing", () => {
      expect(summarizeStep(stepLog({ agent: "strategy" }), ctx())).toBe("no brief produced");
    });

    it("copy: reports variant count", () => {
      const step = stepLog({ agent: "copy" });
      expect(
        summarizeStep(
          step,
          ctx({
            variants: [
              { id: "v1", text: "a", hashtags: [] },
              { id: "v2", text: "b", hashtags: [] }
            ]
          })
        )
      ).toBe("2 variants");
    });

    it("copy: pluralises correctly at 1", () => {
      const step = stepLog({ agent: "copy" });
      expect(summarizeStep(step, ctx({ variants: [{ id: "v1", text: "a", hashtags: [] }] }))).toBe(
        "1 variant"
      );
    });

    it("brand: top score + warning count", () => {
      const step = stepLog({ agent: "brand" });
      const result = summarizeStep(
        step,
        ctx({
          variants: [
            {
              id: "v1",
              text: "a",
              hashtags: [],
              brandScore: 82,
              brandFlags: [{ agent: "brand", severity: "warning", code: "w", message: "m" }]
            },
            { id: "v2", text: "b", hashtags: [], brandScore: 71, brandFlags: [] }
          ]
        })
      );
      expect(result).toContain("top score: 82");
      expect(result).toContain("1 warning");
    });

    it("brand: 'no flags' when clean", () => {
      const step = stepLog({ agent: "brand" });
      const result = summarizeStep(
        step,
        ctx({
          variants: [{ id: "v1", text: "a", hashtags: [], brandScore: 90, brandFlags: [] }]
        })
      );
      expect(result).toContain("top score: 90");
      expect(result).toContain("no flags");
    });

    it("photo: confirms image generated", () => {
      const step = stepLog({ agent: "photo" });
      expect(summarizeStep(step, ctx({ imageUrl: "https://cdn/x.png" }))).toBe("image generated");
    });

    it("photo: falls back when no image", () => {
      expect(summarizeStep(stepLog({ agent: "photo" }), ctx())).toBe("no image produced");
    });

    it("compliance: counts blockers/warnings/notes", () => {
      const step = stepLog({ agent: "compliance" });
      const flags: AgentFlag[] = [
        { agent: "compliance", severity: "blocker", code: "c.b", message: "m" },
        { agent: "compliance", severity: "warning", code: "c.w1", message: "m" },
        { agent: "compliance", severity: "warning", code: "c.w2", message: "m" },
        { agent: "brand", severity: "warning", code: "b", message: "m" } // ignored (wrong agent)
      ];
      expect(summarizeStep(step, ctx({ flags }))).toBe("1 blocker, 2 warnings");
    });

    it("compliance: 'clean' when no compliance flags", () => {
      const flags: AgentFlag[] = [{ agent: "brand", severity: "warning", code: "b", message: "m" }];
      expect(summarizeStep(stepLog({ agent: "compliance" }), ctx({ flags }))).toBe("clean");
    });
  });

  it("returns empty for an unknown agent name", () => {
    const step = stepLog({ agent: "unknown" as AgentName });
    expect(summarizeStep(step, ctx())).toBe("");
  });
});
