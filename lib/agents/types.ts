// Agent pipeline contracts.
//
// Note on ownership model (divergence from original brief):
// The brief's PipelineContext had a single `accountId`. This codebase keeps
// two separate concepts — `workspaceId` for tenancy/ownership (what the RLS
// model already uses on assets, conversations, and audit_events), and
// `connectedAccountId` for the destination social account the post will be
// published to. Both are carried through the pipeline so agents can reason
// about brand voice (per connected account) independently of workspace-level
// settings.

export type AgentName = "strategy" | "copy" | "brand" | "photo" | "compliance";

export type FlagSeverity = "blocker" | "warning" | "note";

export interface AgentFlag {
  agent: AgentName;
  severity: FlagSeverity;
  /** Machine-readable code, e.g. "brand.banned_word". */
  code: string;
  /** Human-readable message. */
  message: string;
  suggestion?: string;
  /** Optional pointer to a field / variant id the flag refers to. */
  ref?: string;
}

export interface StrategyBrief {
  audience: string;
  tone: string;
  contentPillar: string;
  cta: { type: string; text: string };
  hashtagClusters: string[];
  /** What the image should convey — lets Photo run in parallel with Copy. */
  visualConcept: string;
  optimalPostTime?: string;
  /** Deterministic pre-check output. */
  constraints: {
    bannedWords: string[];
    requiredDisclaimers: string[];
    platformLimits: { maxChars: number; maxHashtags: number };
  };
}

export interface CaptionVariant {
  id: string;
  text: string;
  hashtags: string[];
  /** 0–100, set by the Brand agent. */
  brandScore?: number;
  brandFlags?: AgentFlag[];
}

export interface AgentStepLog {
  agent: AgentName;
  startedAt: string;
  finishedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  status: "ok" | "error" | "skipped";
  error?: string;
}

export type PipelinePlatform = "instagram" | "facebook";

export interface PipelineContext {
  postId: string;
  userPrompt: string;
  /** Tenant / ownership scope. Drives flag enablement and RLS. */
  workspaceId: string;
  /** Destination social account (e.g. the connected Instagram handle).
   *  Null when the pipeline is run without a specific destination in mind. */
  connectedAccountId: string | null;
  platform: PipelinePlatform;
  brief?: StrategyBrief;
  variants?: CaptionVariant[];
  selectedVariantId?: string;
  imagePrompt?: string;
  imageUrl?: string;
  flags: AgentFlag[];
  stepLog: AgentStepLog[];
}

/** Shape required to start a pipeline — the orchestrator fills in the rest. */
export type PipelineInit = Pick<
  PipelineContext,
  "postId" | "userPrompt" | "workspaceId" | "connectedAccountId" | "platform"
>;
