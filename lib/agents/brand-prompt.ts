// Brand agent prompt assembly + gated logging.
//
// Extracted from brand.ts so (1) the feedback-loop edit section can be
// appended without branching the core prompt, and (2) a debuggable log
// of the exact assembled prompt can fire before each Brand invocation
// without coupling the agent to console output.

import type { BrandEditHistoryEntry, ManagerEditField } from "@/lib/types";
import type { StrategyBrief } from "@/lib/agents/types";

/** Build the Brand system prompt, optionally appending an edit-history
 *  section derived from recent manager_edits. When `editHistory` is an
 *  empty array (or omitted) the prompt is byte-identical to the pre-PR-4
 *  version — caller doesn't need to special-case. */
export function buildBrandSystemPrompt(
  brief: StrategyBrief,
  editHistory: BrandEditHistoryEntry[] = []
): string {
  const base = `You are a brand editor scoring social-media caption variants.
Brand tone: ${brief.tone}
Audience: ${brief.audience}
Content pillar: ${brief.contentPillar}
Scoring rubric (0–100): voice fit, clarity, CTA strength, brand safety.
Emit flags for material issues; severities: "blocker", "warning", "note".
Do NOT rewrite. Return ONLY JSON:
{ "reviews": [ { "variantId": string, "score": number, "flags": [ { "severity": "blocker"|"warning"|"note", "code": string, "message": string, "suggestion": string? } ] } ] }`;

  if (editHistory.length === 0) return base;

  const section = renderEditHistorySection(editHistory);
  return `${base}\n\n${section}`;
}

function renderEditHistorySection(editHistory: BrandEditHistoryEntry[]): string {
  const byField = groupByField(editHistory);
  const rendered = Object.entries(byField)
    .map(([field, rows]) => renderFieldGroup(field as ManagerEditField, rows))
    .join("\n");
  return `Recent manager corrections — match this voice. Prefer phrasings on the right over the left.
${rendered}`;
}

function groupByField(entries: BrandEditHistoryEntry[]): Record<string, BrandEditHistoryEntry[]> {
  const out: Record<string, BrandEditHistoryEntry[]> = {};
  for (const e of entries) {
    (out[e.field] ||= []).push(e);
  }
  return out;
}

function renderFieldGroup(field: ManagerEditField, rows: BrandEditHistoryEntry[]): string {
  const lines = rows.map((r, idx) => `${idx + 1}. ${oneLine(r.before)} → ${oneLine(r.after)}`);
  return `Field: ${field}\n${lines.join("\n")}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ----- Logging ---------------------------------------------------------

/** Env predicate: does this environment emit raw prompt content? */
function isDevEnv(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  // Next.js sets NODE_ENV="development" in dev, "production" in prod.
  // Test env counts as non-prod for logging purposes.
  return nodeEnv !== "production";
}

/** Env predicate: is the LOG_BRAND_PROMPTS toggle set? */
function isPromptLoggingEnabled(): boolean {
  const raw = process.env.LOG_BRAND_PROMPTS;
  if (!raw) return false;
  return raw === "true" || raw === "1" || raw === "yes";
}

export interface LogBrandPromptParams {
  workspaceId: string;
  prompt: string;
  editCount: number;
  /** Allow tests to inject a logger. Defaults to console.info. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log?: (payload: Record<string, any>) => void;
  /** Override env-derived decisions for tests. */
  devOverride?: boolean;
  loggingEnabledOverride?: boolean;
}

/**
 * Emit a structured log of the Brand system prompt before each Brand
 * invocation. Gating:
 *
 *   - Silent in production unless LOG_BRAND_PROMPTS is explicitly set.
 *   - Raw prompt is ONLY logged when NODE_ENV !== "production". In prod,
 *     even when the toggle is on, we emit structured fields (workspaceId,
 *     editCount, promptLength, editSectionChars) but NOT the raw prompt.
 *     Manager edits may contain PII; we don't want them flowing into
 *     application logs.
 *   - workspaceId + editCount are always emitted when the log fires, so
 *     prod logs still give debuggable shape without content.
 */
export function logBrandPrompt(params: LogBrandPromptParams): void {
  const log = params.log ?? ((payload) => console.info("[brand] prompt", payload));
  const dev = params.devOverride ?? isDevEnv();
  const toggle = params.loggingEnabledOverride ?? isPromptLoggingEnabled();

  if (!dev && !toggle) return;

  const editSectionChars = extractEditSectionChars(params.prompt);
  const base: Record<string, unknown> = {
    workspaceId: params.workspaceId,
    editCount: params.editCount,
    promptLength: params.prompt.length,
    editSectionChars
  };

  if (dev) {
    // Dev / non-prod: raw prompt included for easy inspection.
    log({ ...base, prompt: params.prompt });
    return;
  }

  // Production with LOG_BRAND_PROMPTS on: structured fields only, no raw
  // prompt. Redaction-by-default guards against accidental PII leaks.
  log({ ...base, promptRedactedInProduction: true });
}

const EDIT_SECTION_MARKER = "Recent manager corrections — match this voice.";

function extractEditSectionChars(prompt: string): number {
  const idx = prompt.indexOf(EDIT_SECTION_MARKER);
  if (idx < 0) return 0;
  return prompt.length - idx;
}
