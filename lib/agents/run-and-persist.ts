// Single-entry wrapper: runPipeline → persistPipelineResult → emit audit events.
//
// Any caller that wants "do the whole v2 thing" (current: /api/generate-post
// v2 branch; future: cron re-runs, regenerate endpoint in PR 3) invokes this
// wrapper rather than stitching the three primitives together manually. That
// way no caller can forget to emit audit events.
//
// Transactional semantics: matches the existing codebase — assets insert,
// pipeline_runs insert, and audit_events insert are three separate Supabase
// calls back-to-back. A Postgres RPC would give cross-table atomicity but
// is scope for a later refactor.
// TODO(cross-table-atomicity): promote to an RPC when the rest of the
// codebase migrates off PostgREST-only writes. Tracked alongside the
// lifecycle emissions in /api/assets/[id]/publish|retry|destination.

import { randomUUID } from "node:crypto";
import { buildPipelineAuditInserts } from "@/lib/agents/audit";
import { runPipeline, type OrchestratorOptions } from "@/lib/agents/orchestrator";
import {
  persistPipelineResult,
  type PersistSupabase
} from "@/lib/agents/persist";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type { PipelineContext, PipelineInit } from "@/lib/agents/types";
import type { Asset } from "@/lib/types";

export interface RunAndPersistParams {
  supabase: PersistSupabase;
  runtime: AgentRuntime;
  init: PipelineInit;
  userId: string;
  workspaceId: string;
  connectedAccountId: string | null;
  conversationId: string | null;
  prompt: string;
  orchestratorOptions?: OrchestratorOptions;
}

export type RunAndPersistResult =
  | {
      ok: true;
      asset: Asset;
      ctx: PipelineContext;
      durationMs: number;
      pipelineRunId: string;
      auditEventCount: number;
      auditError?: unknown;
    }
  | {
      ok: false;
      reason: "pipeline_incomplete" | "persist_failed";
      message: string;
      ctx: PipelineContext;
      durationMs: number;
    };

/**
 * Runs the pipeline, persists the asset + pipeline_runs, then emits a
 * batched audit_events insert (one row per completed stepLog entry).
 *
 * Failure modes:
 *   - Pipeline ran but produced no variant or no image → ok:false,
 *     reason:"pipeline_incomplete". No persist, no audit writes.
 *   - Pipeline ran and produced outputs but persist threw → ok:false,
 *     reason:"persist_failed". No audit writes (no asset row to attach to).
 *   - Everything succeeded except the audit insert → ok:true with
 *     auditError populated. The asset is still visible in the approval
 *     queue; only the timeline events are missing. Caller can log.
 */
export async function runAndPersistPipeline(
  params: RunAndPersistParams
): Promise<RunAndPersistResult> {
  const startedAt = Date.now();
  const ctx = await runPipeline(params.init, params.runtime, params.orchestratorOptions);
  const durationMs = Date.now() - startedAt;

  if (!ctx.selectedVariantId || !ctx.imageUrl) {
    return {
      ok: false,
      reason: "pipeline_incomplete",
      message: "Pipeline did not produce a caption + image.",
      ctx,
      durationMs
    };
  }

  // Generate the pipeline_runs.id upfront so we can thread it into audit
  // metadata without a round-trip to the DB.
  const runId = randomUUID();

  let asset: Asset;
  try {
    const persisted = await persistPipelineResult(params.supabase, {
      userId: params.userId,
      workspaceId: params.workspaceId,
      connectedAccountId: params.connectedAccountId,
      conversationId: params.conversationId,
      prompt: params.prompt,
      ctx,
      durationMs,
      runId
    });
    asset = persisted.asset;
  } catch (error) {
    const message = error instanceof Error ? error.message : "persist failed";
    return { ok: false, reason: "persist_failed", message, ctx, durationMs };
  }

  const auditRows = buildPipelineAuditInserts({
    assetId: asset.id,
    userId: params.userId,
    ctx,
    runId
  });

  let auditError: unknown;
  if (auditRows.length > 0) {
    const { error } = await params.supabase.from("audit_events").insert(auditRows);
    if (error) auditError = error;
  }

  return {
    ok: true,
    asset,
    ctx,
    durationMs,
    pipelineRunId: runId,
    auditEventCount: auditRows.length,
    ...(auditError !== undefined ? { auditError } : {})
  };
}
