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

export interface RunFromAgentOptions extends OrchestratorOptions {
  /** When true, only `from` + its transitive downstream consumers re-run
   *  (per AGENT_INVALIDATION_MAP). Parallel siblings that don't consume
   *  `from`'s output are preserved. Default is false, which keeps the
   *  original "from → end of AGENT_ORDER" semantics. */
  isolate?: boolean;
}

// Explicit dependency graph — each key invalidates its listed downstream
// consumers when re-run. Encoded as data so adding a new agent is a local
// change rather than branching logic elsewhere.
//
//   Strategy → Copy, Photo, Brand, Compliance   (brief feeds all three)
//   Copy     → Brand, Compliance                 (variants feed Brand; selected variant feeds Compliance)
//   Photo    → Compliance                        (image feeds Compliance only; NOT Brand — Brand scores captions)
//   Brand    → Compliance                        (selected variant id feeds Compliance)
//   Compliance → ∅
export const AGENT_INVALIDATION_MAP: Record<AgentName, readonly AgentName[]> = {
  strategy: ["copy", "photo", "brand", "compliance"],
  copy: ["brand", "compliance"],
  photo: ["compliance"],
  brand: ["compliance"],
  compliance: []
};

/** Compute the set of agents that should re-run given a starting agent and
 *  the isolate flag. Isolated runs traverse AGENT_INVALIDATION_MAP; full
 *  runs slice AGENT_ORDER from the starting agent onward. */
export function runSetFor(from: AgentName, isolate: boolean): Set<AgentName> {
  if (isolate) {
    return new Set<AgentName>([from, ...AGENT_INVALIDATION_MAP[from]]);
  }
  const fromIndex = AGENT_ORDER.indexOf(from);
  return new Set(AGENT_ORDER.slice(fromIndex));
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
  const runSet = new Set<AgentName>(AGENT_ORDER);
  return executePipelineWithRunSet(initialContext(init), runSet, runtime, costCap);
}

/**
 * Re-run a subset of the pipeline from an existing context.
 *   - `from` — which agent to start at.
 *   - `options.isolate` — when true, only `from` + its downstream consumers
 *     (per AGENT_INVALIDATION_MAP) re-run. Parallel siblings that don't
 *     consume `from`'s output are preserved. Default false keeps the
 *     original "from → end of AGENT_ORDER" semantics.
 * Cost cap applies to the resumed run only; preserved stepLog entries
 * do not count against the new cap.
 */
export async function runFromAgent(
  ctx: PipelineContext,
  from: AgentName,
  runtime: AgentRuntime,
  options?: RunFromAgentOptions
): Promise<PipelineContext> {
  const costCap = resolveCostCap(options);
  const runSet = runSetFor(from, options?.isolate ?? false);
  const { retained, dropped } = splitContextByRunSet(ctx, runSet);
  void dropped;
  return executePipelineWithRunSet(retained, runSet, runtime, costCap);
}

const AGENT_ORDER: AgentName[] = ["strategy", "copy", "photo", "brand", "compliance"];

interface SplitResult {
  retained: PipelineContext;
  dropped: { stepLog: PipelineContext["stepLog"]; flags: PipelineContext["flags"] };
}

/** Remove stepLog entries + context fields owned by agents in the run set.
 *  Preserve everything outside the run set so parallel siblings or earlier
 *  agents survive the re-run. */
function splitContextByRunSet(ctx: PipelineContext, runSet: Set<AgentName>): SplitResult {
  const retainedStepLog = ctx.stepLog.filter((s) => !runSet.has(s.agent));
  const retainedFlags = ctx.flags.filter((f) => !runSet.has(f.agent));
  const droppedStepLog = ctx.stepLog.filter((s) => runSet.has(s.agent));
  const droppedFlags = ctx.flags.filter((f) => runSet.has(f.agent));

  const cleared: PipelineContext = { ...ctx, flags: retainedFlags, stepLog: retainedStepLog };
  if (runSet.has("strategy")) cleared.brief = undefined;
  if (runSet.has("copy")) cleared.variants = undefined;
  if (runSet.has("photo")) {
    cleared.imagePrompt = undefined;
    cleared.imageUrl = undefined;
  }
  if (runSet.has("brand")) {
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

/** Execute the canonical pipeline order, but only call agents whose names
 *  are in runSet. Preserves parallelism for Copy + Photo when both are
 *  included. */
async function executePipelineWithRunSet(
  startCtx: PipelineContext,
  runSet: Set<AgentName>,
  runtime: AgentRuntime,
  costCap: number
): Promise<PipelineContext> {
  let ctx = startCtx;
  const startingCost = totalCost(ctx);

  // 1. Strategy
  if (runSet.has("strategy")) {
    ctx = await runStrategy(ctx, runtime);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 2. Copy + Photo in parallel — both, one, or neither.
  const needsCopy = runSet.has("copy");
  const needsPhoto = runSet.has("photo");
  if (needsCopy || needsPhoto) {
    const copyPromise = needsCopy ? runCopy(ctx, runtime) : Promise.resolve(ctx);
    const photoPromise = needsPhoto ? runPhoto(ctx, runtime) : Promise.resolve(ctx);
    const [copyCtx, photoCtx] = await Promise.all([copyPromise, photoPromise]);
    ctx = mergeParallel(ctx, copyCtx, photoCtx);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 3. Brand
  if (runSet.has("brand")) {
    ctx = await runBrand(ctx, runtime);
    ctx = autoSelectVariant(ctx);
    if (capExceeded(ctx, startingCost, costCap)) {
      return appendCapFlag(ctx);
    }
  }

  // 4. Compliance
  if (runSet.has("compliance")) {
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
