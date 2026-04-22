// Partial-regenerate helper.
//
// Runs runFromAgent on an existing PipelineContext, then updates the
// assets row, inserts a new pipeline_runs row, and emits batched audit
// events for the steps that re-ran.
//
// Step semantics
//   "copy"     → runFromAgent(ctx, "copy", { isolate: true })
//                 Re-runs copy + brand + compliance. Image preserved.
//   "photo"    → runFromAgent(ctx, "photo", { isolate: true })
//                 Re-runs photo + compliance. Variants + brand preserved.
//   "strategy" → Caller must supply briefOverride. We seed ctx.brief
//                 directly (Strategy agent is NOT re-run — the user's
//                 edits ARE the new brief), then runFromAgent(ctx, "copy",
//                 { isolate: false }) to cascade through all downstream
//                 agents. An additional pipeline.strategy_overridden audit
//                 event is emitted to mark the user attribution.
//
// Cross-table atomicity is non-transactional (matches PR 1/2 pattern);
// the asset update, pipeline_runs insert, and audit_events insert are
// three separate PostgREST calls. TODO(cross-table-atomicity) when the
// codebase migrates off PostgREST-only writes.

import { randomUUID } from "node:crypto";
import {
  buildPipelineAuditInserts,
  buildStrategyOverrideInsert,
  type AuditEventInsert
} from "@/lib/agents/audit";
import { runFromAgent, runSetFor } from "@/lib/agents/orchestrator";
import { resolveMaxFlagSeverity } from "@/lib/agents/severity";
import type { PersistSupabase } from "@/lib/agents/persist";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type { AgentName, PipelineContext, StrategyBrief } from "@/lib/agents/types";

export type RegenerateStep = "strategy" | "copy" | "photo";

export interface RegenerateParams {
  supabase: PersistSupabase;
  runtime: AgentRuntime;
  step: RegenerateStep;
  briefOverride?: StrategyBrief;
  existingCtx: PipelineContext;
  existingAssetId: string;
  userId: string;
  workspaceId: string;
  connectedAccountId: string | null;
}

export type RegenerateResult =
  | {
      ok: true;
      newCtx: PipelineContext;
      runId: string;
      auditEventCount: number;
      runSetAgents: AgentName[];
    }
  | { ok: false; message: string; newCtx: PipelineContext };

function sumDurationMs(ctx: PipelineContext, runSet: Set<AgentName>): number {
  return ctx.stepLog
    .filter((s) => runSet.has(s.agent))
    .reduce((sum, s) => {
      const a = Date.parse(s.startedAt);
      const b = Date.parse(s.finishedAt);
      if (Number.isNaN(a) || Number.isNaN(b)) return sum;
      return sum + Math.max(0, b - a);
    }, 0);
}

function sumCostUsd(ctx: PipelineContext, runSet: Set<AgentName>): number {
  const raw = ctx.stepLog
    .filter((s) => runSet.has(s.agent))
    .reduce((sum, s) => sum + s.costUsd, 0);
  return Math.round(raw * 10_000) / 10_000;
}

function newRunModelVersions(ctx: PipelineContext, runSet: Set<AgentName>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of ctx.stepLog) {
    if (runSet.has(step.agent) && step.model) out[step.agent] = step.model;
  }
  return out;
}

export async function regenerateAndPersist(params: RegenerateParams): Promise<RegenerateResult> {
  let ctx = params.existingCtx;
  const runId = randomUUID();
  let overrideEmitted = false;
  let startAgent: AgentName;
  let isolate: boolean;

  if (params.step === "strategy") {
    if (!params.briefOverride) {
      return { ok: false, message: "briefOverride is required for step=strategy.", newCtx: ctx };
    }
    // User's edits ARE the new brief; don't re-run the Strategy agent.
    ctx = { ...ctx, brief: params.briefOverride };
    overrideEmitted = true;
    startAgent = "copy";
    isolate = false; // cascade through copy + photo + brand + compliance
  } else if (params.step === "copy") {
    startAgent = "copy";
    isolate = true; // re-runs copy + brand + compliance; image preserved
  } else {
    startAgent = "photo";
    isolate = true; // re-runs photo + compliance; caption preserved
  }

  const runSet = runSetFor(startAgent, isolate);
  ctx = await runFromAgent(ctx, startAgent, params.runtime, { isolate });

  const selected = ctx.variants?.find((v) => v.id === ctx.selectedVariantId);
  if (!selected || !ctx.imageUrl) {
    return {
      ok: false,
      message: "Regenerate did not produce a usable variant + image.",
      newCtx: ctx
    };
  }

  // Update the assets row for whichever fields this step changed.
  const now = new Date().toISOString();
  const updateFields: Record<string, unknown> = { updated_at: now };
  if (runSet.has("copy")) {
    updateFields.output = selected.text;
  }
  if (runSet.has("photo")) {
    updateFields.media_url = ctx.imageUrl;
    updateFields.media_prompt = ctx.imagePrompt ?? null;
  }
  await params.supabase
    .from("assets")
    .update(updateFields)
    .eq("id", params.existingAssetId);

  // Insert the new pipeline_runs row. Cost + duration scoped to the steps
  // that re-ran, not the whole context (which still has preserved entries).
  const runRow = {
    id: runId,
    asset_id: params.existingAssetId,
    user_id: params.userId,
    workspace_id: params.workspaceId,
    connected_account_id: params.connectedAccountId,
    total_cost_usd: sumCostUsd(ctx, runSet),
    duration_ms: sumDurationMs(ctx, runSet),
    model_versions: newRunModelVersions(ctx, runSet),
    // Store the full context (preserved + new) so the drawer can render
    // the state-of-the-world as of this run.
    context: ctx,
    max_flag_severity: resolveMaxFlagSeverity(ctx.flags)
  };
  await params.supabase.from("pipeline_runs").insert(runRow);

  // Audit events: only for agents that re-ran in this run.
  const newStepEntries = ctx.stepLog.filter((s) => runSet.has(s.agent));
  const stepAuditRows = buildPipelineAuditInserts({
    assetId: params.existingAssetId,
    userId: params.userId,
    ctx: { ...ctx, stepLog: newStepEntries },
    runId
  });

  const allRows: AuditEventInsert[] = [...stepAuditRows];

  if (overrideEmitted) {
    // Place the override event just before the earliest new step so the
    // timeline renders it at the top of the Generation block.
    const earliestStep = newStepEntries.reduce<string | undefined>((min, s) => {
      if (!min) return s.finishedAt;
      return Date.parse(s.finishedAt) < Date.parse(min) ? s.finishedAt : min;
    }, undefined);
    const overrideCreatedAt = earliestStep
      ? new Date(Date.parse(earliestStep) - 1).toISOString()
      : new Date().toISOString();
    allRows.unshift(
      buildStrategyOverrideInsert({
        assetId: params.existingAssetId,
        userId: params.userId,
        runId,
        createdAt: overrideCreatedAt
      })
    );
  }

  if (allRows.length > 0) {
    await params.supabase.from("audit_events").insert(allRows);
  }

  return {
    ok: true,
    newCtx: ctx,
    runId,
    auditEventCount: allRows.length,
    runSetAgents: Array.from(runSet)
  };
}
