// Audit-event constants and payload shape for pipeline steps.
//
// Lives separately from lib/agents/persist.ts so UI code (timeline) can import
// the action constants without pulling in server-only dependencies.

import { summarizeStep } from "@/lib/agents/audit-summary";
import type { AgentName, AgentStepLog, PipelineContext } from "@/lib/agents/types";

export const PIPELINE_AUDIT_ACTIONS = [
  "pipeline.strategy_drafted",
  "pipeline.copy_drafted",
  "pipeline.brand_reviewed",
  "pipeline.image_generated",
  "pipeline.compliance_checked",
  // strategy_overridden is emitted instead of strategy_drafted when the
  // caller seeds the brief from a user-supplied override (regenerate
  // endpoint with step=strategy + briefOverride). The action name alone
  // carries the attribution — no extra metadata field needed.
  "pipeline.strategy_overridden"
] as const;

export type PipelineAuditAction = (typeof PIPELINE_AUDIT_ACTIONS)[number];

/** Compact payload stored on audit_events.metadata for pipeline steps.
 *  Full agent output stays in pipeline_runs.context; this is what renders
 *  inline in the Generation group of the Activity Timeline.
 *
 *  runId back-references the pipeline_runs row this step belonged to. It's
 *  optional for backward compatibility with events emitted before 1:N
 *  regenerate landed — callers should fall back to "latest run for asset"
 *  when runId is absent. */
export interface PipelineAuditPayload {
  agent: AgentName;
  durationMs: number;
  model: string;
  costUsd: number;
  summary: string;
  runId?: string;
}

const ACTION_BY_AGENT: Record<AgentName, PipelineAuditAction> = {
  strategy: "pipeline.strategy_drafted",
  copy: "pipeline.copy_drafted",
  brand: "pipeline.brand_reviewed",
  photo: "pipeline.image_generated",
  compliance: "pipeline.compliance_checked"
};

export function pipelineActionForAgent(agent: AgentName): PipelineAuditAction {
  return ACTION_BY_AGENT[agent];
}

export function isPipelineAuditAction(value: string): value is PipelineAuditAction {
  return (PIPELINE_AUDIT_ACTIONS as readonly string[]).includes(value);
}

export interface AuditEventInsert {
  asset_id: string;
  user_id: string;
  action: PipelineAuditAction;
  metadata: PipelineAuditPayload;
  created_at: string;
}

export interface BuildAuditInsertsParams {
  assetId: string;
  userId: string;
  ctx: PipelineContext;
  /** pipeline_runs.id this set of events belongs to. Threaded into each
   *  row's metadata so the timeline drawer can fetch the specific run. */
  runId: string;
}

function durationMsForStep(step: AgentStepLog): number {
  const started = Date.parse(step.startedAt);
  const finished = Date.parse(step.finishedAt);
  if (Number.isNaN(started) || Number.isNaN(finished)) return 0;
  return Math.max(0, finished - started);
}

/**
 * Build one AuditEventInsert per completed stepLog entry. Pure — designed
 * to be fed straight into a batch `supabase.from("audit_events").insert([...])`
 * by the caller, matching today's one-round-trip pattern.
 *
 * created_at is taken from each step's finishedAt so the events land in
 * strict step order when the rail fetches them back with
 * `.order("created_at", { ascending: false })`.
 */
export function buildPipelineAuditInserts(params: BuildAuditInsertsParams): AuditEventInsert[] {
  const { assetId, userId, ctx, runId } = params;
  return ctx.stepLog.map((step) => ({
    asset_id: assetId,
    user_id: userId,
    action: pipelineActionForAgent(step.agent),
    metadata: {
      agent: step.agent,
      durationMs: durationMsForStep(step),
      model: step.model,
      costUsd: step.costUsd,
      summary: summarizeStep(step, ctx),
      runId
    },
    created_at: step.finishedAt
  }));
}

/** Build a single audit event row for "user overrode the strategy brief".
 *  Emitted by the regenerate endpoint when step=strategy + a briefOverride
 *  is submitted, IN ADDITION to the standard stepLog-derived events for
 *  the downstream agents that re-ran. */
export interface BuildStrategyOverrideInsertParams {
  assetId: string;
  userId: string;
  runId: string;
  /** ISO timestamp to stamp created_at with. Caller-supplied for
   *  determinism and to place the event before downstream events in the
   *  timeline. */
  createdAt: string;
}

export function buildStrategyOverrideInsert(
  params: BuildStrategyOverrideInsertParams
): AuditEventInsert {
  return {
    asset_id: params.assetId,
    user_id: params.userId,
    action: "pipeline.strategy_overridden",
    metadata: {
      agent: "strategy",
      durationMs: 0,
      model: "user-override",
      costUsd: 0,
      summary: "Brief overridden by user",
      runId: params.runId
    },
    created_at: params.createdAt
  };
}
