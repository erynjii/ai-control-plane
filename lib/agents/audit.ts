// Audit-event constants and payload shape for pipeline steps.
//
// Lives separately from lib/agents/persist.ts so UI code (timeline) can import
// the action constants without pulling in server-only dependencies.

import type { AgentName } from "@/lib/agents/types";

export const PIPELINE_AUDIT_ACTIONS = [
  "pipeline.strategy_drafted",
  "pipeline.copy_drafted",
  "pipeline.brand_reviewed",
  "pipeline.image_generated",
  "pipeline.compliance_checked"
] as const;

export type PipelineAuditAction = (typeof PIPELINE_AUDIT_ACTIONS)[number];

/** Compact payload stored on audit_events.metadata for pipeline steps.
 *  Full agent output stays in pipeline_runs.context; this is what renders
 *  inline in the Generation group of the Activity Timeline. */
export interface PipelineAuditPayload {
  agent: AgentName;
  durationMs: number;
  model: string;
  costUsd: number;
  summary: string;
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
