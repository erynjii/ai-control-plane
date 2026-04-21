// Strategy agent — produces a StrategyBrief from the user prompt + platform.
//
// Two halves:
//   1. Deterministic pre-check populates brief.constraints from the static
//      platform table (buildConstraints). No model call required, always
//      reproducible.
//   2. A chat-model call produces the creative half of the brief
//      (audience, tone, CTA, hashtag clusters, visual concept).
//
// Photo runs in parallel with Copy downstream, so we must always set
// `visualConcept` — Photo seeds its prompt from it.

import { buildConstraints } from "@/lib/agents/constraints";
import { costFor } from "@/lib/agents/pricing";
import { executeStep } from "@/lib/agents/step";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type { PipelineContext, StrategyBrief } from "@/lib/agents/types";

const STRATEGY_MODEL = "gpt-4.1-mini";

const STRATEGY_SYSTEM_PROMPT = `You are a senior social content strategist.
Given a user's request and the target platform, produce a creative brief.
Respond with ONLY a JSON object that matches this shape:
{
  "audience": string,       // one-sentence description of who this is for
  "tone": string,           // e.g. "warm, playful, professional"
  "contentPillar": string,  // the theme this post reinforces
  "cta": { "type": string, "text": string },
  "hashtagClusters": string[],  // 1-4 short groupings, each a string
  "visualConcept": string,  // 1-2 sentences an image model could use
  "optimalPostTime": string // optional local-time window; may be empty string
}
Do not include any other fields, commentary, or markdown.`;

type StrategyModelOutput = Omit<StrategyBrief, "constraints">;

function parseStrategyJson(raw: string): StrategyModelOutput {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const audience = parsed.audience;
  const tone = parsed.tone;
  const contentPillar = parsed.contentPillar;
  const cta = parsed.cta as { type?: unknown; text?: unknown } | undefined;
  const hashtagClusters = parsed.hashtagClusters;
  const visualConcept = parsed.visualConcept;
  const optimalPostTime = parsed.optimalPostTime;

  if (
    typeof audience !== "string" ||
    typeof tone !== "string" ||
    typeof contentPillar !== "string" ||
    !cta ||
    typeof cta.type !== "string" ||
    typeof cta.text !== "string" ||
    !Array.isArray(hashtagClusters) ||
    !hashtagClusters.every((h): h is string => typeof h === "string") ||
    typeof visualConcept !== "string"
  ) {
    throw new Error("Strategy model output did not match the required schema.");
  }

  return {
    audience,
    tone,
    contentPillar,
    cta: { type: cta.type, text: cta.text },
    hashtagClusters,
    visualConcept,
    optimalPostTime: typeof optimalPostTime === "string" && optimalPostTime.length > 0
      ? optimalPostTime
      : undefined
  };
}

export async function runStrategy(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<PipelineContext> {
  return executeStep<StrategyBrief>(ctx, {
    agent: "strategy",
    run: async () => {
      const response = await runtime.chat({
        agent: "strategy",
        model: STRATEGY_MODEL,
        system: STRATEGY_SYSTEM_PROMPT,
        user: `Platform: ${ctx.platform}\nUser request: ${ctx.userPrompt}`,
        jsonSchemaHint: "strategy_brief",
        temperature: 0.7
      });
      const creative = parseStrategyJson(response.text);
      const brief: StrategyBrief = {
        ...creative,
        constraints: buildConstraints(ctx.platform)
      };
      return {
        result: brief,
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
    apply: (current, brief) => ({ ...current, brief })
  });
}
