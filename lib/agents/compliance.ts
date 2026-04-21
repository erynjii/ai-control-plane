// Compliance agent — final gate on the selected variant + image.
//
// Emits flags; does NOT block. The approval queue decides what to do with
// blocker-severity flags downstream. This agent's job is to surface issues
// the rest of the pipeline didn't catch (banned terms, missing disclaimers,
// platform-specific policy hints) and record them in ctx.flags.

import { costFor } from "@/lib/agents/pricing";
import { executeStep } from "@/lib/agents/step";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type {
  AgentFlag,
  FlagSeverity,
  PipelineContext
} from "@/lib/agents/types";

const COMPLIANCE_MODEL = "gpt-4.1-mini";

const COMPLIANCE_SYSTEM_PROMPT = `You are a social-media compliance reviewer.
You receive one caption + one image URL + platform + brand constraints.
Identify material compliance issues only (banned words, missing required
disclaimers, policy red flags for the stated platform, claims that would
require substantiation).
Emit flags, never rewrite. Severities: "blocker" | "warning" | "note".
Return ONLY JSON:
{ "flags": [ { "severity": string, "code": string, "message": string, "suggestion": string? } ] }
If nothing to flag, return { "flags": [] }.`;

interface RawFlag {
  severity?: unknown;
  code?: unknown;
  message?: unknown;
  suggestion?: unknown;
}

function parseComplianceJson(raw: string, selectedVariantId: string): AgentFlag[] {
  const parsed = JSON.parse(raw) as { flags?: unknown };
  if (!Array.isArray(parsed.flags)) {
    throw new Error("Compliance model output must include a flags array.");
  }
  return parsed.flags.map((f, i) => {
    const flag = f as RawFlag;
    if (
      flag.severity !== "blocker" &&
      flag.severity !== "warning" &&
      flag.severity !== "note"
    ) {
      throw new Error(`Flag ${i}: invalid severity`);
    }
    if (typeof flag.code !== "string" || typeof flag.message !== "string") {
      throw new Error(`Flag ${i}: code/message must be strings`);
    }
    return {
      agent: "compliance",
      severity: flag.severity as FlagSeverity,
      code: flag.code,
      message: flag.message,
      suggestion: typeof flag.suggestion === "string" ? flag.suggestion : undefined,
      ref: selectedVariantId
    };
  });
}

export async function runCompliance(
  ctx: PipelineContext,
  runtime: AgentRuntime
): Promise<PipelineContext> {
  return executeStep<AgentFlag[]>(ctx, {
    agent: "compliance",
    preconditions: () => {
      if (!ctx.selectedVariantId || !ctx.variants) {
        return {
          skip: true,
          flag: {
            agent: "compliance",
            severity: "warning",
            code: "compliance.missing_selection",
            message: "No selected variant to review."
          }
        };
      }
      const selected = ctx.variants.find((v) => v.id === ctx.selectedVariantId);
      if (!selected) {
        return {
          skip: true,
          flag: {
            agent: "compliance",
            severity: "warning",
            code: "compliance.variant_not_found",
            message: `Selected variant ${ctx.selectedVariantId} not present in variants list.`
          }
        };
      }
      return { skip: false };
    },
    run: async () => {
      const selected = ctx.variants!.find((v) => v.id === ctx.selectedVariantId)!;
      const payload = JSON.stringify({
        platform: ctx.platform,
        caption: selected.text,
        hashtags: selected.hashtags,
        imageUrl: ctx.imageUrl ?? null,
        constraints: ctx.brief?.constraints ?? null
      });
      const response = await runtime.chat({
        agent: "compliance",
        model: COMPLIANCE_MODEL,
        system: COMPLIANCE_SYSTEM_PROMPT,
        user: payload,
        jsonSchemaHint: "compliance_flags",
        temperature: 0
      });
      const flags = parseComplianceJson(response.text, selected.id);
      return {
        result: flags,
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
    apply: (current, newFlags) => ({ ...current, flags: [...current.flags, ...newFlags] })
  });
}
