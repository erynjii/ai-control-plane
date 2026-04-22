// summarizeStep — one short human-readable line per agent step, stored on
// audit_events.metadata.summary and shown inline under the Generation group
// in the Activity Timeline.
//
// Pure: takes an AgentStepLog entry plus the final PipelineContext (so it
// can look up scores/flags/variants on the already-completed run).

import type { AgentFlag, AgentStepLog, PipelineContext } from "@/lib/agents/types";

export function summarizeStep(step: AgentStepLog, ctx: PipelineContext): string {
  if (step.status === "error") {
    return `error: ${step.error ?? "unknown"}`;
  }
  if (step.status === "skipped") {
    const skipCode = firstFlagCodeFor(step.agent, ctx.flags);
    return skipCode ? `skipped: ${skipCode}` : "skipped";
  }

  switch (step.agent) {
    case "strategy":
      return summarizeStrategy(ctx);
    case "copy":
      return summarizeCopy(ctx);
    case "brand":
      return summarizeBrand(ctx);
    case "photo":
      return summarizePhoto(ctx);
    case "compliance":
      return summarizeCompliance(ctx);
    default:
      return "";
  }
}

function firstFlagCodeFor(agent: string, flags: AgentFlag[]): string | null {
  const match = flags.find((flag) => flag.agent === agent);
  return match?.code ?? null;
}

function summarizeStrategy(ctx: PipelineContext): string {
  if (!ctx.brief) return "no brief produced";
  const tone = ctx.brief.tone ? `tone='${truncate(ctx.brief.tone, 40)}'` : null;
  const pillar = ctx.brief.contentPillar ? `pillar='${truncate(ctx.brief.contentPillar, 40)}'` : null;
  return [tone, pillar].filter(Boolean).join(", ") || "brief produced";
}

function summarizeCopy(ctx: PipelineContext): string {
  const count = ctx.variants?.length ?? 0;
  if (count === 0) return "no variants";
  return `${count} variant${count === 1 ? "" : "s"}`;
}

function summarizeBrand(ctx: PipelineContext): string {
  const variants = ctx.variants ?? [];
  const scores = variants.map((v) => v.brandScore).filter((s): s is number => typeof s === "number");
  const topScore = scores.length > 0 ? Math.max(...scores) : null;
  const brandFlagsCount = variants.reduce((acc, v) => acc + (v.brandFlags?.length ?? 0), 0);
  const warningOrBlocker = variants.reduce(
    (acc, v) => acc + (v.brandFlags?.filter((f) => f.severity !== "note").length ?? 0),
    0
  );
  const parts: string[] = [];
  if (topScore !== null) parts.push(`top score: ${topScore}`);
  if (warningOrBlocker > 0) {
    parts.push(`${warningOrBlocker} warning${warningOrBlocker === 1 ? "" : "s"}`);
  } else if (brandFlagsCount > 0) {
    parts.push(`${brandFlagsCount} note${brandFlagsCount === 1 ? "" : "s"}`);
  } else {
    parts.push("no flags");
  }
  return parts.join(", ");
}

function summarizePhoto(ctx: PipelineContext): string {
  if (!ctx.imageUrl) return "no image produced";
  return "image generated";
}

function summarizeCompliance(ctx: PipelineContext): string {
  const complianceFlags = ctx.flags.filter((flag) => flag.agent === "compliance");
  if (complianceFlags.length === 0) return "clean";
  const blockers = complianceFlags.filter((f) => f.severity === "blocker").length;
  const warnings = complianceFlags.filter((f) => f.severity === "warning").length;
  const notes = complianceFlags.filter((f) => f.severity === "note").length;
  const parts: string[] = [];
  if (blockers > 0) parts.push(`${blockers} blocker${blockers === 1 ? "" : "s"}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  if (notes > 0) parts.push(`${notes} note${notes === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
