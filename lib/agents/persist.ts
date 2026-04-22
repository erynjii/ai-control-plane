// Persists a completed PipelineContext: inserts the assets row (same shape
// as v1) and the paired pipeline_runs row. Extracted from the route so it
// can be unit-tested with a fake Supabase client.

import type { PipelineContext } from "@/lib/agents/types";
import type { Asset } from "@/lib/types";
import { ASSET_SELECT } from "@/lib/assets/select";
import { resolveMaxFlagSeverity } from "@/lib/agents/severity";
import { scanContent } from "@/lib/scan";

/** Kept intentionally loose (`any` return) so that both a real SupabaseClient
 *  and a hand-rolled test fake satisfy it. Narrowing too tightly here makes
 *  the real client incompatible, and the narrow test fake is still
 *  type-checked by the test file itself. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface PersistSupabase {
  from(table: string): any;
}

export interface PersistParams {
  userId: string;
  workspaceId: string;
  connectedAccountId: string | null;
  conversationId: string | null;
  prompt: string;
  ctx: PipelineContext;
  durationMs: number;
  /** pipeline_runs.id for this run. Caller generates upfront so the same
   *  id can be threaded into the audit_events metadata without waiting on
   *  a round-trip to the DB. */
  runId: string;
  /** Timestamp used for created_at/updated_at (ISO 8601). Explicit so tests
   *  are deterministic. */
  now?: string;
}

export interface PersistResult {
  asset: Asset;
  pipelineRunId: string;
  pipelineRunError?: unknown;
}

function totalCost(ctx: PipelineContext): number {
  return ctx.stepLog.reduce((sum, step) => sum + step.costUsd, 0);
}

function modelVersions(ctx: PipelineContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of ctx.stepLog) {
    if (step.model) out[step.agent] = step.model;
  }
  return out;
}

function pickAssetModel(ctx: PipelineContext): string {
  // Prefer the model that produced the visible caption (Copy). Fallback to
  // Strategy's model if Copy didn't run. Final fallback: "pipeline-v2".
  const copyStep = ctx.stepLog.find((s) => s.agent === "copy" && s.model);
  if (copyStep?.model) return copyStep.model;
  const strategyStep = ctx.stepLog.find((s) => s.agent === "strategy" && s.model);
  if (strategyStep?.model) return strategyStep.model;
  return "pipeline-v2";
}

/**
 * Build the assets insert row for a v2 post. Kept public and side-effect-free
 * so tests can assert the shape matches v1 without touching a database.
 */
export function buildAssetInsert(params: PersistParams): Record<string, unknown> {
  const { ctx, prompt, userId, workspaceId, conversationId } = params;
  const selected = ctx.variants?.find((v) => v.id === ctx.selectedVariantId);
  if (!selected) {
    throw new Error("Pipeline did not select a variant.");
  }
  if (!ctx.imageUrl) {
    throw new Error("Pipeline did not produce an image URL.");
  }
  const scan = scanContent({ prompt, output: selected.text });
  const now = params.now ?? new Date().toISOString();

  return {
    id: ctx.postId,
    workspace_id: workspaceId,
    user_id: userId,
    prompt,
    // v1 stores the full single-shot system prompt. v2 has many — leaving
    // null here is semantically accurate for "no single system prompt".
    system_prompt: null,
    output: selected.text,
    model: pickAssetModel(ctx),
    status: "draft",
    risk_level: scan.riskLevel,
    scan_findings: scan.findings,
    promoted: false,
    conversation_id: conversationId,
    media_type: "image",
    media_prompt: ctx.imagePrompt ?? null,
    media_url: ctx.imageUrl,
    created_at: now,
    updated_at: now
  };
}

export function buildPipelineRunInsert(params: PersistParams, assetId: string): Record<string, unknown> {
  const { ctx, userId, workspaceId, connectedAccountId, durationMs, runId } = params;
  return {
    id: runId,
    asset_id: assetId,
    user_id: userId,
    workspace_id: workspaceId,
    connected_account_id: connectedAccountId,
    total_cost_usd: Math.round(totalCost(ctx) * 10_000) / 10_000,
    duration_ms: durationMs,
    model_versions: modelVersions(ctx),
    context: ctx,
    max_flag_severity: resolveMaxFlagSeverity(ctx.flags)
  };
}

export async function persistPipelineResult(
  supabase: PersistSupabase,
  params: PersistParams
): Promise<PersistResult> {
  const assetRow = buildAssetInsert(params);
  const inserted = await supabase
    .from("assets")
    .insert(assetRow)
    .select(ASSET_SELECT)
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error("Failed to insert asset for v2 pipeline.");
  }
  const asset = inserted.data;

  const runRow = buildPipelineRunInsert(params, asset.id);
  const runResult = await supabase.from("pipeline_runs").insert(runRow);
  return {
    asset,
    pipelineRunId: params.runId,
    pipelineRunError: runResult.error ?? undefined
  };
}
