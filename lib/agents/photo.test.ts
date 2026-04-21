import { describe, expect, it } from "vitest";
import { buildConstraints } from "./constraints";
import { runPhoto } from "./photo";
import { baseContext, stubRuntime } from "./test-utils";
import type { PipelineContext, StrategyBrief } from "./types";

const SAMPLE_BRIEF: StrategyBrief = {
  audience: "A",
  tone: "warm, celebratory",
  contentPillar: "opening",
  cta: { type: "booking", text: "Book" },
  hashtagClusters: [],
  visualConcept: "Softly lit spa interior with warm wood tones.",
  constraints: buildConstraints("instagram")
};

function ctxWithBrief(): PipelineContext {
  return { ...baseContext(), brief: SAMPLE_BRIEF };
}

describe("runPhoto", () => {
  it("builds a prompt from visualConcept + tone and stores url + prompt on ctx", async () => {
    let capturedPrompt: string | null = null;
    const runtime = stubRuntime({
      image: (req) => {
        capturedPrompt = req.prompt;
        return { imageUrl: "https://cdn.example/img.png", model: "gpt-image-1", costUsd: 0.04 };
      }
    });

    const next = await runPhoto(ctxWithBrief(), runtime);

    expect(next.imageUrl).toBe("https://cdn.example/img.png");
    expect(next.imagePrompt).toContain("Softly lit spa interior");
    expect(next.imagePrompt).toContain("warm, celebratory");
    expect(capturedPrompt).toContain("Softly lit spa interior");
    expect(next.stepLog[0]).toMatchObject({ agent: "photo", status: "ok", costUsd: 0.04 });
    // Images don't carry token counts.
    expect(next.stepLog[0].inputTokens).toBe(0);
    expect(next.stepLog[0].outputTokens).toBe(0);
  });

  it("skips with a blocker flag when visualConcept is missing", async () => {
    const runtime = stubRuntime({
      image: () => ({ imageUrl: "", model: "", costUsd: 0 })
    });
    const next = await runPhoto(baseContext(), runtime);

    expect(next.imageUrl).toBeUndefined();
    expect(next.imagePrompt).toBeUndefined();
    expect(next.stepLog[0].status).toBe("skipped");
    expect(next.flags[0]).toMatchObject({
      agent: "photo",
      severity: "blocker",
      code: "photo.missing_visual_concept"
    });
  });

  it("flags and logs an error when the image runtime fails", async () => {
    const runtime = stubRuntime({
      image: () => {
        throw new Error("image api 429");
      }
    });

    const next = await runPhoto(ctxWithBrief(), runtime);

    expect(next.imageUrl).toBeUndefined();
    expect(next.stepLog[0].status).toBe("error");
    expect(next.stepLog[0].error).toBe("image api 429");
    expect(next.flags[0]).toMatchObject({ agent: "photo", code: "photo.error" });
  });
});
