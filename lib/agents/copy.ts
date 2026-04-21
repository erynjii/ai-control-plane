// Copy agent — produces 2–3 CaptionVariants from a StrategyBrief.
//
// Runs in parallel with Photo, seeded by the same brief. Responsible for
// respecting platform + brand constraints; Brand scores these variants in a
// later step and does NOT rewrite.

import { costFor } from "@/lib/agents/pricing";
import { executeStep } from "@/lib/agents/step";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type { CaptionVariant, PipelineContext, StrategyBrief } from "@/lib/agents/types";

const COPY_MODEL = "gpt-4.1-mini";

function buildSystemPrompt(brief: StrategyBrief): string {
  const banned =
    brief.constraints.bannedWords.length > 0
      ? `Avoid these words: ${brief.constraints.bannedWords.join(", ")}.`
      : "";
  const disclaimers =
    brief.constraints.requiredDisclaimers.length > 0
      ? `Every variant must include: ${brief.constraints.requiredDisclaimers.join("; ")}.`
      : "";

  return `You are a senior social copywriter.
You will receive a creative brief. Produce 2–3 distinct caption variants.
Constraints:
- Max ${brief.constraints.platformLimits.maxChars} characters per caption.
- At most ${brief.constraints.platformLimits.maxHashtags} hashtags per caption.
- Tone: ${brief.tone}
- Audience: ${brief.audience}
- Content pillar: ${brief.contentPillar}
- CTA type: ${brief.cta.type} — suggested text: "${brief.cta.text}"
${banned}
${disclaimers}
Respond with ONLY a JSON object:
{ "variants": [ { "text": string, "hashtags": string[] } ] }
Exactly 2 or 3 variants. No other fields. No markdown.`;
}

interface CopyModelVariant {
  text: string;
  hashtags: string[];
}

function parseCopyJson(raw: string): CopyModelVariant[] {
  const parsed = JSON.parse(raw) as { variants?: unknown };
  const variants = parsed.variants;
  if (!Array.isArray(variants)) {
    throw new Error("Copy model output must include a variants array.");
  }
  if (variants.length < 2 || variants.length > 3) {
    throw new Error(`Copy model must return 2 or 3 variants, got ${variants.length}.`);
  }
  return variants.map((v, index) => {
    const entry = v as { text?: unknown; hashtags?: unknown };
    if (typeof entry.text !== "string" || !entry.text.trim()) {
      throw new Error(`Variant ${index}: missing text`);
    }
    if (!Array.isArray(entry.hashtags) || !entry.hashtags.every((h) => typeof h === "string")) {
      throw new Error(`Variant ${index}: hashtags must be string[]`);
    }
    return { text: entry.text.trim(), hashtags: entry.hashtags as string[] };
  });
}

function variantId(postId: string, index: number): string {
  return `${postId}_v${index + 1}`;
}

export async function runCopy(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<PipelineContext> {
  return executeStep<CaptionVariant[]>(ctx, {
    agent: "copy",
    preconditions: () => {
      if (!ctx.brief) {
        return {
          skip: true,
          flag: {
            agent: "copy",
            severity: "blocker",
            code: "copy.missing_brief",
            message: "Strategy brief is required before running Copy."
          }
        };
      }
      return { skip: false };
    },
    run: async () => {
      // Safe: precondition above guarantees brief exists.
      const brief = ctx.brief!;
      const response = await runtime.chat({
        agent: "copy",
        model: COPY_MODEL,
        system: buildSystemPrompt(brief),
        user: `Visual concept for the accompanying image (do not describe it in the caption): ${brief.visualConcept}\nUser request: ${ctx.userPrompt}`,
        jsonSchemaHint: "copy_variants",
        temperature: 0.8
      });
      const raw = parseCopyJson(response.text);
      const variants: CaptionVariant[] = raw.map((variant, index) => ({
        id: variantId(ctx.postId, index),
        text: variant.text,
        hashtags: variant.hashtags
      }));
      return {
        result: variants,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: costFor({
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens
        })
      };
    },
    apply: (current, variants) => ({ ...current, variants })
  });
}
