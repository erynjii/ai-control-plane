// Shared helper for the boilerplate every agent would otherwise repeat:
// time the call, build a step log, and on error return a flag+log rather
// than throwing. Agents stay focused on their own prompt + parse logic.

import type {
  AgentFlag,
  AgentName,
  AgentStepLog,
  FlagSeverity,
  PipelineContext
} from "@/lib/agents/types";

export interface StepSuccess<T> {
  result: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StepHooks<T> {
  agent: AgentName;
  /** If the agent short-circuits (e.g. upstream data missing), return a flag
   *  and the step logs "skipped" instead of running. */
  preconditions?: () => { skip: true; flag: AgentFlag } | { skip: false };
  run: () => Promise<StepSuccess<T>>;
  /** Applied to the context when run() resolved successfully. */
  apply: (ctx: PipelineContext, result: T) => PipelineContext;
  /** Severity used for the flag when run() throws. Defaults to "warning". */
  errorSeverity?: FlagSeverity;
}

/** Returns a fresh PipelineContext with flags/stepLog appended — never mutates
 *  the input. Agents always call exactly this helper so stepLog is guaranteed
 *  to have one entry per invocation. */
export async function executeStep<T>(
  ctx: PipelineContext,
  hooks: StepHooks<T>
): Promise<PipelineContext> {
  const startedAt = new Date().toISOString();

  const precondition = hooks.preconditions?.();
  if (precondition?.skip) {
    const finishedAt = new Date().toISOString();
    const log: AgentStepLog = {
      agent: hooks.agent,
      startedAt,
      finishedAt,
      model: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      status: "skipped"
    };
    return {
      ...ctx,
      flags: [...ctx.flags, precondition.flag],
      stepLog: [...ctx.stepLog, log]
    };
  }

  try {
    const outcome = await hooks.run();
    const finishedAt = new Date().toISOString();
    const log: AgentStepLog = {
      agent: hooks.agent,
      startedAt,
      finishedAt,
      model: outcome.model,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: outcome.costUsd,
      status: "ok"
    };
    const applied = hooks.apply(ctx, outcome.result);
    return { ...applied, stepLog: [...applied.stepLog, log] };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown error";
    const log: AgentStepLog = {
      agent: hooks.agent,
      startedAt,
      finishedAt,
      model: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      status: "error",
      error: message
    };
    const flag: AgentFlag = {
      agent: hooks.agent,
      severity: hooks.errorSeverity ?? "warning",
      code: `${hooks.agent}.error`,
      message
    };
    return {
      ...ctx,
      flags: [...ctx.flags, flag],
      stepLog: [...ctx.stepLog, log]
    };
  }
}
