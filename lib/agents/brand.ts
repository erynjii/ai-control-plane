// Brand agent — scores each CaptionVariant 0–100 and attaches brand flags.
//
// **Does not rewrite text.** If a variant needs revision, that's Copy's job
// on a re-run (runFromAgent in PR 3). Keeping responsibilities split keeps
// auditability clean — the variant text you see on the approval card is
// exactly what Copy produced.
//
// Feedback loop (PR 4): when BRAND_FEEDBACK_WORKSPACES includes this
// workspace AND runtime.fetchBrandEdits is wired, Brand pulls the last
// 20 manager_edits via the runtime and appends them to the system prompt.
// Runtime hook is optional so test runtimes stay minimal. Flag check is
// per-workspace; any miss short-circuits back to the base prompt.

import { isBrandFeedbackEnabled } from "@/lib/flags";
import { buildBrandSystemPrompt, logBrandPrompt } from "@/lib/agents/brand-prompt";
import { costFor } from "@/lib/agents/pricing";
import { executeStep } from "@/lib/agents/step";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type {
  AgentFlag,
  CaptionVariant,
  FlagSeverity,
  PipelineContext
} from "@/lib/agents/types";
import type { BrandEditHistoryEntry } from "@/lib/types";

const BRAND_MODEL = "gpt-4.1-mini";

async function collectEditHistory(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<BrandEditHistoryEntry[]> {
  if (!isBrandFeedbackEnabled(ctx.workspaceId)) return [];
  if (!runtime.fetchBrandEdits) return [];
  try {
    return await runtime.fetchBrandEdits(ctx.workspaceId);
  } catch {
    // Non-fatal: Brand runs with the base prompt if the fetch fails.
    return [];
  }
}

interface RawFlag {
  severity: unknown;
  code: unknown;
  message: unknown;
  suggestion?: unknown;
}

interface RawReview {
  variantId: unknown;
  score: unknown;
  flags?: unknown;
}

function parseBrandJson(raw: string): { variantId: string; score: number; flags: AgentFlag[] }[] {
  const parsed = JSON.parse(raw) as { reviews?: unknown };
  if (!Array.isArray(parsed.reviews)) {
    throw new Error("Brand model output must include a reviews array.");
  }
  return parsed.reviews.map((r, index) => {
    const review = r as RawReview;
    if (typeof review.variantId !== "string") {
      throw new Error(`Review ${index}: variantId must be string`);
    }
    const variantId: string = review.variantId;
    if (typeof review.score !== "number" || Number.isNaN(review.score)) {
      throw new Error(`Review ${index}: score must be number`);
    }
    const flags = Array.isArray(review.flags) ? review.flags : [];
    const parsedFlags: AgentFlag[] = flags.map((f, i) => {
      const flag = f as RawFlag;
      if (
        flag.severity !== "blocker" &&
        flag.severity !== "warning" &&
        flag.severity !== "note"
      ) {
        throw new Error(`Review ${index} flag ${i}: invalid severity`);
      }
      if (typeof flag.code !== "string" || typeof flag.message !== "string") {
        throw new Error(`Review ${index} flag ${i}: code/message must be strings`);
      }
      return {
        agent: "brand",
        severity: flag.severity as FlagSeverity,
        code: flag.code,
        message: flag.message,
        suggestion: typeof flag.suggestion === "string" ? flag.suggestion : undefined,
        ref: variantId
      };
    });
    return {
      variantId,
      score: Math.max(0, Math.min(100, Math.round(review.score))),
      flags: parsedFlags
    };
  });
}

export async function runBrand(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<PipelineContext> {
  return executeStep<CaptionVariant[]>(ctx, {
    agent: "brand",
    preconditions: () => {
      if (!ctx.brief) {
        return {
          skip: true,
          flag: {
            agent: "brand",
            severity: "blocker",
            code: "brand.missing_brief",
            message: "Strategy brief is required before running Brand."
          }
        };
      }
      if (!ctx.variants || ctx.variants.length === 0) {
        return {
          skip: true,
          flag: {
            agent: "brand",
            severity: "blocker",
            code: "brand.missing_variants",
            message: "Caption variants are required before running Brand."
          }
        };
      }
      return { skip: false };
    },
    run: async () => {
      const brief = ctx.brief!;
      const variants = ctx.variants!;
      const editHistory = await collectEditHistory(ctx, runtime);
      const systemPrompt = buildBrandSystemPrompt(brief, editHistory);
      logBrandPrompt({
        workspaceId: ctx.workspaceId,
        prompt: systemPrompt,
        editCount: editHistory.length
      });
      const payload = JSON.stringify({
        variants: variants.map((v) => ({ id: v.id, text: v.text, hashtags: v.hashtags }))
      });
      const response = await runtime.chat({
        agent: "brand",
        model: BRAND_MODEL,
        system: systemPrompt,
        user: payload,
        jsonSchemaHint: "brand_reviews",
        temperature: 0.2
      });
      const reviews = parseBrandJson(response.text);

      // Merge scores + per-variant flags back onto variants. Variants not
      // reviewed keep their original shape (no brandScore set).
      const reviewByVariant = new Map(reviews.map((r) => [r.variantId, r]));
      const scored: CaptionVariant[] = variants.map((variant) => {
        const review = reviewByVariant.get(variant.id);
        if (!review) return variant;
        return { ...variant, brandScore: review.score, brandFlags: review.flags };
      });

      return {
        result: scored,
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
    apply: (current, variants) => {
      // Surface every per-variant flag at the top-level ctx.flags so the
      // approval queue's severity badge can aggregate without parsing into
      // each variant. Text is not mutated.
      const extraFlags = variants.flatMap((v) => v.brandFlags ?? []);
      return { ...current, variants, flags: [...current.flags, ...extraFlags] };
    }
  });
}
