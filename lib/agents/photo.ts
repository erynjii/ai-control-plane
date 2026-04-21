// Photo agent — builds an image prompt from brief.visualConcept + tone and
// calls the runtime's image client. Returns a publicly reachable URL.
//
// Runs in parallel with Copy. Only input required is brief.visualConcept.

import { executeStep } from "@/lib/agents/step";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type { PipelineContext } from "@/lib/agents/types";

function buildImagePrompt(visualConcept: string, tone: string): string {
  const toneLine = tone ? ` Style: ${tone}.` : "";
  return `${visualConcept}${toneLine} High quality editorial photograph, natural lighting, no text or logos overlaid on the image.`;
}

interface PhotoResult {
  imagePrompt: string;
  imageUrl: string;
}

export async function runPhoto(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<PipelineContext> {
  return executeStep<PhotoResult>(ctx, {
    agent: "photo",
    preconditions: () => {
      if (!ctx.brief?.visualConcept) {
        return {
          skip: true,
          flag: {
            agent: "photo",
            severity: "blocker",
            code: "photo.missing_visual_concept",
            message: "Strategy brief.visualConcept is required before running Photo."
          }
        };
      }
      return { skip: false };
    },
    run: async () => {
      const brief = ctx.brief!;
      const imagePrompt = buildImagePrompt(brief.visualConcept, brief.tone ?? "");
      const response = await runtime.image({
        agent: "photo",
        prompt: imagePrompt,
        size: "1024x1024"
      });
      return {
        result: { imagePrompt, imageUrl: response.imageUrl },
        model: response.model,
        // Image APIs bill per image, not per token.
        inputTokens: 0,
        outputTokens: 0,
        costUsd: response.costUsd
      };
    },
    apply: (current, { imagePrompt, imageUrl }) => ({ ...current, imagePrompt, imageUrl })
  });
}
