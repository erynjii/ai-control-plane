# Agent Pipeline — Claude Code Implementation Briefs

Four sequential PRs. Hand each to Claude Code in a **separate session**. Do not combine.

Assumed stack (Claude Code should verify first): Next.js + TypeScript, existing `/api/generate-post` route, existing approval queue UI, existing audit-event table. Adjust paths to match the real codebase.

## How to prompt Claude Code (paste at the start of every session)

```
Before you write anything:
1. Read the files relevant to this task and summarize what you found.
2. Confirm the types/paths I've given match the real codebase. If they don't, propose corrections.
3. Propose your plan and stop. Wait for approval before implementing.

While you work:
- Types first. Add or update interfaces as your first commit, then implement against them.
- Small commits. One logical change per commit.
- Add tests in the same PR as the change.
- No scope creep. Note unrelated issues in a TODO, don't fix them here.
- Preserve feature flags. Don't change defaults or delete flag branches.
```

---

## PR 1 — Types + agent scaffolding (behavior-preserving, feature-flagged)

### Context
`/api/generate-post` today does a single-shot generation (caption + image). This PR introduces a multi-agent pipeline (Strategy → Copy + Photo in parallel → Brand → Compliance) behind a feature flag. No user-visible changes. Purpose: lock in the contracts and run shadow executions to validate output quality vs. the current flow.

### Contracts — `lib/agents/types.ts`

```ts
export type AgentName = "strategy" | "copy" | "brand" | "photo" | "compliance";
export type FlagSeverity = "blocker" | "warning" | "note";

export interface AgentFlag {
  agent: AgentName;
  severity: FlagSeverity;
  code: string;           // machine-readable, e.g. "brand.banned_word"
  message: string;        // human-readable
  suggestion?: string;
  ref?: string;           // pointer to a field/variant, optional
}

export interface StrategyBrief {
  audience: string;
  tone: string;
  contentPillar: string;
  cta: { type: string; text: string };
  hashtagClusters: string[];
  visualConcept: string;   // what the image should convey — lets Photo run in parallel with Copy
  optimalPostTime?: string;
  constraints: {           // deterministic precheck output
    bannedWords: string[];
    requiredDisclaimers: string[];
    platformLimits: { maxChars: number; maxHashtags: number };
  };
}

export interface CaptionVariant {
  id: string;
  text: string;
  hashtags: string[];
  brandScore?: number;     // 0-100, set by Brand agent
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

export interface PipelineContext {
  postId: string;
  userPrompt: string;
  accountId: string;
  platform: "instagram" | "facebook";    // extend as needed
  brief?: StrategyBrief;
  variants?: CaptionVariant[];
  selectedVariantId?: string;
  imagePrompt?: string;
  imageUrl?: string;
  flags: AgentFlag[];
  stepLog: AgentStepLog[];
}
```

### Agent modules — `lib/agents/{strategy,copy,brand,photo,compliance}.ts`

Each exports `run<Agent>(ctx: PipelineContext): Promise<PipelineContext>`. Rules:
- Pure in → pure out. No hidden state.
- Use structured outputs (JSON schema / function calling) wherever the output is consumed by another agent.
- Append exactly one `AgentStepLog` per invocation.
- On error, return ctx with `stepLog` entry `status: "error"` and an `AgentFlag` — do not throw.

Agent responsibilities:
- **Strategy** — produces `StrategyBrief` from `userPrompt` + account context. Runs a deterministic pre-check to populate `constraints` (banned words list, disclaimer requirements, platform limits).
- **Copy** — produces 2–3 `CaptionVariant`s from the brief. Must respect `constraints`.
- **Photo** — produces `imagePrompt` + `imageUrl` from `brief.visualConcept` + tone. Runs in parallel with Copy.
- **Brand** — scores each variant 0–100 and emits `AgentFlag`s. **Does not rewrite.** Rewriting is Copy's job on a re-run.
- **Compliance** — final gate on `selectedVariantId` + `imageUrl`. Emits flags; doesn't block.

### Orchestrator — `lib/agents/orchestrator.ts`

```ts
export async function runPipeline(
  init: Pick<PipelineContext, "postId" | "userPrompt" | "accountId" | "platform">
): Promise<PipelineContext>;
```

Ordering:
1. Strategy (sequential)
2. Copy + Photo in **parallel** (both seeded by `brief`)
3. Brand (runs over Copy's variants)
4. Auto-select highest-scoring variant → set `selectedVariantId`
5. Compliance (runs on selected variant + image)

Rules:
- If an agent errors, continue. Missing upstream data becomes a flag, not a 500.
- Per-pipeline cost cap (default `$0.50`, configurable via env). If exceeded, stop and flag.

### Partial-run endpoint (stub only in this PR)

```ts
export async function runFromAgent(
  ctx: PipelineContext,
  from: AgentName
): Promise<PipelineContext>;
```

Takes an existing context, re-runs from a specific agent forward. No UI wire-up yet — wired in PR 3.

### Feature flag

Env var `PIPELINE_V2` (default `false`). In `/api/generate-post`:
- `false` → existing behavior, unchanged
- `true` → `runPipeline(...)`
- Both branches write the same row shape to the posts table so downstream UI doesn't care.

Log pipeline costs to a `pipeline_runs` table (postId, totalCost, durations, model versions) for before/after comparison.

### Acceptance
- With flag off: zero behavior change. Existing tests pass.
- With flag on: a new post ends up in the approval queue with populated `brief`, `variants`, `imageUrl`, `flags`, `stepLog`.
- Unit test per agent using a mocked model client: input shape → expected output shape → step log appended.
- One integration test runs the whole pipeline against stub clients and asserts the final `PipelineContext` shape.
- Per-pipeline cost cap enforced.

### Don't touch
- Approval UI, state machine, audit-trail schema, timeline (all in later PRs).
- Existing `/api/generate-post` behavior when flag is off.
- Auth, storage, connected accounts, insights.

---

## PR 2 — Pipeline events in the Activity Timeline

### Context
Activity Timeline currently shows post-approval lifecycle events (Queued, Publishing, Published, Failed). Extend it upstream to show what the agents did.

### What to build
1. **Audit event schema.** Add event kinds: `pipeline.strategy_drafted`, `pipeline.copy_drafted`, `pipeline.brand_reviewed`, `pipeline.image_generated`, `pipeline.compliance_checked`. Payload: `{ agent, durationMs, model, costUsd, summary }`. `summary` is a short human string like `"score: 82, 1 warning"`.
2. **Emit from orchestrator.** One audit event per completed agent step. Use a DB transaction with the post row update so partial pipelines don't leave orphaned events.
3. **Timeline UI.** Render pipeline events with the existing timeline component. Group under a collapsible `Generation` header above the lifecycle group. Each row: agent icon, label, timestamp, summary, cost. Click to expand full agent output in a side drawer.
4. **Cost rollup.** Total pipeline cost summed at the top of the Generation group.

### Acceptance
- A v2 post shows 5 pipeline events before the first lifecycle event.
- Failed agent renders an error state inline and doesn't break subsequent events.
- Timeline for v1 (flag off) posts is unchanged.

### Don't touch
- Lifecycle events, post creation logic, approval flow.

---

## PR 3 — Approval card upgrades

### Context
Four features that compress manager review time: expandable flags, strategy brief on the card, partial-regenerate, edit-diff capture.

### What to build

1. **Expandable severity tag.** The `LOW`/`MED`/`HIGH` pill on the card becomes clickable. Clicking expands an inline panel listing each flag: severity dot, agent name, message, suggestion. Blockers first. Collapse on second click. No navigation.

2. **Strategy brief row.** Compact line under the caption: `Audience: X · Tone: Y · CTA: Z`. Click → expands full brief inline. Data from `ctx.brief`. If missing (v1 post), hide the row.

3. **Partial-regenerate actions.** Kebab menu next to Approve/Reject:
   - `Regenerate caption` → `runFromAgent(ctx, "copy")`
   - `Regenerate image` → `runFromAgent(ctx, "photo")`
   - `Adjust strategy & regenerate` → opens modal to edit brief, then `runFromAgent(ctx, "strategy")` with edits as overrides
   
   Each is an endpoint `POST /api/posts/:id/regenerate?step=<agent>`. Cost estimate shown in tooltip before click. Writes new pipeline events to the timeline.

4. **Edit-diff capture.** When the manager edits the caption before approving, capture pre/post text. New table `manager_edits`: `{ id, postId, field, before, after, editorId, editedAt }`. Add an `edited` badge on approved cards that had edits. No diff viewer UI yet (PR 4).

### Acceptance
- Flags expand/collapse in place without navigation.
- Regenerate actions complete, emit new timeline events, and leave unrelated context intact (e.g. regenerating image doesn't touch caption).
- Manager edits land in `manager_edits` with correct before/after. Verify by editing a caption and querying the table.
- All existing Approve/Reject/Open flows unchanged.

### Don't touch
- Pipeline internals (PR 1), timeline (PR 2), insights (PR 4).

---

## PR 4 — Insights + feedback loop

### Context
Two additions: better metrics, and feeding manager edits back into the Brand agent as implicit training signal.

### What to build

1. **New Insights metrics.** Add to the existing panel:
   - **Edit rate** — `% of approved posts where manager_edits exists`
   - **Time-to-approve** — median seconds, `pending_review → approved`
   - **Cost per approved post** — `sum(pipeline_runs.totalCost) / approved posts`
   
   Keep existing: Total created, Approval rate, Published, Failed. Trend indicators (up/down %) on all metrics.

2. **Feedback loop.** Before running the Brand agent, fetch the last 20 `manager_edits` rows for this account. Include as a section in the Brand system prompt: `"Recent manager corrections — match this voice. Prefer phrasings on the right over the left."` Cache per account, 1-hour TTL.

3. **Edit diff viewer.** Click `edited` badge on an approved post → drawer with before/after, line-level diff highlighting. Read-only.

### Acceptance
- Insights panel shows 7 metrics, computed correctly on seeded test data.
- Brand agent prompts include recent edits — verify by logging one assembled prompt in dev.
- Diff drawer renders correctly with additions/deletions highlighted.

### Don't touch
- Agent pipeline internals; any agent other than Brand.

---

## After PR 4 — speculative, not scoped

These are worth discussing before committing to:
- **Batch approve.** Multi-select clean posts in the queue, approve as a group. Only matters once volume justifies it.
- **Per-manager voice models.** Separate feedback caches per editor, not per account. Only if you have multiple editors with different styles.
- **A/B test harness.** Publish two variants to different audience segments, feed performance back to Strategy. Real product-level bet — don't build until the base loop is solid.
