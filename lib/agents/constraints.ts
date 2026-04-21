// Deterministic pre-check data consumed by the Strategy agent.
// Keeping this static + versioned in code means the Strategy step stays
// reproducible: given the same userPrompt and the same constraints module
// version, the brief.constraints block is identical.
//
// TODO(pipeline-v2 follow-up): allow workspace-level overrides of banned
// words and disclaimers once workspace settings exist. For now these are
// global per-platform defaults.

import type { PipelinePlatform, StrategyBrief } from "@/lib/agents/types";

type PlatformLimits = StrategyBrief["constraints"]["platformLimits"];

const PLATFORM_LIMITS: Record<PipelinePlatform, PlatformLimits> = {
  instagram: { maxChars: 2200, maxHashtags: 30 },
  facebook: { maxChars: 63206, maxHashtags: 30 }
};

// Seed list — not exhaustive, and intentionally conservative. Brand/Compliance
// agents layer on account-specific vocabulary in later PRs.
const GLOBAL_BANNED_WORDS: string[] = ["guaranteed", "miracle", "cure", "risk-free"];

const PLATFORM_DISCLAIMERS: Record<PipelinePlatform, string[]> = {
  instagram: [],
  facebook: []
};

export function platformLimitsFor(platform: PipelinePlatform): PlatformLimits {
  return PLATFORM_LIMITS[platform];
}

export function bannedWordsFor(_platform: PipelinePlatform): string[] {
  return [...GLOBAL_BANNED_WORDS];
}

export function requiredDisclaimersFor(platform: PipelinePlatform): string[] {
  return [...PLATFORM_DISCLAIMERS[platform]];
}

export function buildConstraints(platform: PipelinePlatform): StrategyBrief["constraints"] {
  return {
    bannedWords: bannedWordsFor(platform),
    requiredDisclaimers: requiredDisclaimersFor(platform),
    platformLimits: platformLimitsFor(platform)
  };
}
