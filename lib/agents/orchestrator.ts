// Pipeline orchestrator.
//
// Ordering:
//   1. Strategy                                (sequential)
//   2. Copy + Photo                            (parallel, both seeded by brief)
//   3. Brand                                   (runs over Copy's variants)
//   4. Auto-select highest-scoring variant
//   5. Compliance                              (runs on selected variant + image)
//
// Invariants:
//   - Agents NEVER throw; executeStep wraps errors as flags + error stepLog.
//     A failure at any stage continues the pipeline with whatever data is
//     available; missing upstream data becomes a skipped step, not a 500.
//   - Per-pipeline cost cap: PIPELINE_COST_CAP_USD (default 0.50). If the
//     running total exceeds the cap after any step, remaining steps are
//     skipped and a "pipeline.cost_cap_exceeded" flag is appended.
//   - Context returned from runPipeline is a fresh object; callers are free
//     to pass it to runFromAgent for partial re-runs.

import { runBrand } from "@/lib/agents/brand";
import { runCompliance } from "@/lib/agents/compliance";
import { runCopy } from "@/lib/agents/copy";
import { runPhoto } from "@/lib/agents/photo";
import { runStrategy } from "@/lib/agents/strategy";
import type { AgentRuntime } from "@/lib/agents/runtime";
import type {
  AgentFlag,
  AgentName,
  CaptionVariant,
  PipelineContext,
  PipelineInit
} from "@/lib/agents/types";

export interface OrchestratorOptions {
  /** Override the default $0.50 cap for tests or per-deployment tuning. */
  costCapUsd?: number;
}

function resolveCostCap(options: OrchestratorOptions | undefined): number {
  if (options?.costCapUsd !== undefined) return options.costCapUsd;
  const raw = process.env.PIPELINE_COST_CAP_USD;
  if (!raw) return 0.5;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.5;
}

function totalCost(ctx: PipelineContext): number {
  return ctx.stepLog.reduce((acc, step) => acc + step.costUsd, 0);
}

function appendFlag(ctx: PipelineContext, flag: AgentFlag): PipelineContext {
  return { ...ctx, flags: [...ctx.flags, flag] };
}

function autoSelectVariant(ctx: PipelineContext): PipelineContext {
  if (ctx.selectedVariantId) return ctx;
  if (!ctx.variants || ctx.variants.length === 0) return ctx;
  const best = pickHighestScoring(ctx.variants);
  return { ...ctx, selectedVariantId: best.id };
}

function pickHighestScoring(variants: CaptionVariant[]): CaptionVariant {
  return variants.reduce((top, candidate) => {
    const topScore = top.brandScore ?? -Infinity;
    const candidateScore = candidate.brandScore ?? -Infinity;
    return candidateScore > topScore ? candidate : top;
  });
}

function initialContext(init: PipelineInit): PipelineContext {
  return {
    postId: init.postId,
    userPrompt: init.userPrompt,
    workspaceId: init.workspaceId,
    connectedAccountId: init.connectedAccountId,
    platform: init.platform,
    flags: [],
    stepLog: []
  };
}

export async function runPipeline(
  init: PipelineInit,
  runtime: AgentRuntime,
  options?: OrchestratorOptions
): Promise<PipelineContext> {
  const costCap = resolveCostCap(options);
  return executePipelineFrom(initialContext(init), "strategy", runtime, costCap);
}

/**
 * Re-run the pipeline starting from a specific agent. The stub for PR 1:
 * no HTTP route yet (wired in PR 3). Semantics:
 *   - `from` = agent to start at. Steps before it are preserved unchanged.
 *   - Steps from `from` onward are re-executed, replacing their previous
 *     outputs and stepLog entries.
 *   - Cost cap applies to the RESUMED run only; prior costs are preserved
 *     in stepLog but not counted against the new cap.
 */
export async function runFromAgent(
  ctx: PipelineContext,
  from: AgentName,
  runtime: AgentRuntime,
  options?: OrchestratorOptions
): Promise<PipelineContext> {
  const costCap = resolveCostCap(options);
  const { retained, dropped } = splitContextAt(ctx, from);
  const resumed = await executePipelineFrom(retained, from, runtime, costCap);
  // Prior flags+stepLog entries from dropped agents are intentionally
  // discarded. They represent results we just overwrote.
  void dropped;
  return resumed;
}

const AGENT_ORDER: AgentName[] = ["strategy", "copy", "photo", "brand", "compliance"];

interface SplitResult {
  retained: PipelineContext;
  dropped: { stepLog: PipelineContext["stepLog"]; flags: PipelineContext["flags"] };
}

function splitContextAt(ctx: PipelineContext, from: AgentName): SplitResult {
  // Keep any agent step + flag that ran BEFORE `from`; discard everything
  // from `from` onward so re-runs start clean.
  const fromIndex = AGENT_ORDER.indexOf(from);
  const priorAgents = new Set(AGENT_ORDER.slice(0, fromIndex));
  const retainedStepLog = ctx.stepLog.filter((s) => priorAgents.has(s.agent));
  const retainedFlags = ctx.flags.filter((f) => priorAgents.has(f.agent));
  const droppedStepLog = ctx.stepLog.filter((s) => !priorAgents.has(s.agent));
  const droppedFlags = ctx.flags.filter((f) => !priorAgents.has(f.agent));

  // Also clear fields owned by agents at/after `from`.
  const cleared: PipelineContext = { ...ctx, flags: retainedFlags, stepLog: retainedStepLog };
  if (!priorAgents.has("strategy")) cleared.brief = undefined;
  if (!priorAgents.has("copy")) cleared.variants = undefined;
  if (!priorAgents.has("photo")) {
    cleared.imagePrompt = undefined;
    cleared.imageUrl = undefined;
  }
  if (!priorAgents.has("brand")) {
    cleared.variants = cleared.variants?.map((v) => ({
      ...v,
      brandScore: undefined,
      brandFlags: undefined
    }));
    cleared.selectedVariantId = undefined;
  }

  return {
    retained: cleared,
    dropped: { stepLog: droppedStepLog, flags: droppedFlags }
  };
}

async function executePipelineFrom(
  startCtx: PipelineContext,
  from: AgentName,
  runtime: AgentRuntime,
  costCap: number
): Promise<PipelineContext> {
  const fromIndex = AGENT_ORDER.indexOf(from);
  let ctx = startCtx;
  const startingCost = totalCost(ctx);

  // 1. Strategy
  if (fromIndex <= AGENT_ORDER.indexOf("strategy")) {
    ctx = await runStrategy(ctx, runtime);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 2. Copy + Photo in parallel
  if (fromIndex <= AGENT_ORDER.indexOf("photo")) {
    const needsCopy = fromIndex <= AGENT_ORDER.indexOf("copy");
    const needsPhoto = fromIndex <= AGENT_ORDER.indexOf("photo");
    const copyPromise = needsCopy ? runCopy(ctx, runtime) : Promise.resolve(ctx);
    const photoPromise = needsPhoto ? runPhoto(ctx, runtime) : Promise.resolve(ctx);
    const [copyCtx, photoCtx] = await Promise.all([copyPromise, photoPromise]);
    ctx = mergeParallel(ctx, copyCtx, photoCtx);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 3. Brand
  if (fromIndex <= AGENT_ORDER.indexOf("brand")) {
    ctx = await runBrand(ctx, runtime);
    ctx = autoSelectVariant(ctx);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 4. Compliance
  if (fromIndex <= AGENT_ORDER.indexOf("compliance")) {
    ctx = await runCompliance(ctx, runtime);
  }

  return ctx;
}

function capExceeded(ctx: PipelineContext, startingCost: number, costCap: number): boolean {
  return totalCost(ctx) - startingCost > costCap;
}

function appendCapFlag(ctx: PipelineContext): PipelineContext {
  return appendFlag(ctx, {
    agent: "strategy", // attributed to no single agent; use strategy as a catch-all source
    severity: "blocker",
    code: "pipeline.cost_cap_exceeded",
    message: "Pipeline cost cap exceeded. Remaining steps skipped."
  });
}

/**
 * Merge the two parallel branches. Copy and Photo both started from the same
 * `ctx` and each only writes its own fields + appends its own log/flag, so
 * merging is straightforward: take each branch's delta and apply both.
 */
function mergeParallel(
  original: PipelineContext,
  copyCtx: PipelineContext,
  photoCtx: PipelineContext
): PipelineContext {
  return {
    ...original,
    variants: copyCtx.variants ?? original.variants,
    imagePrompt: photoCtx.imagePrompt ?? original.imagePrompt,
    imageUrl: photoCtx.imageUrl ?? original.imageUrl,
    flags: [...original.flags, ...deltaFlags(original, copyCtx), ...deltaFlags(original, photoCtx)],
    stepLog: [
      ...original.stepLog,
      ...deltaStepLog(original, copyCtx),
      ...deltaStepLog(original, photoCtx)
    ]
  };
}

function deltaFlags(before: PipelineContext, after: PipelineContext): AgentFlag[] {
  return after.flags.slice(before.flags.length);
}

function deltaStepLog(before: PipelineContext, after: PipelineContext): PipelineContext["stepLog"] {
  return after.stepLog.slice(before.stepLog.length);
}
