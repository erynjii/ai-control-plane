// Feature-flag helpers.
//
// PIPELINE_V2_WORKSPACES: comma-separated list of workspace ids that should
// execute the multi-agent v2 pipeline in /api/generate-post. Workspaces not
// listed continue to run the byte-identical v1 code path.
//
// BRAND_FEEDBACK_WORKSPACES: comma-separated list of workspace ids that
// should read recent manager_edits and include them as a feedback section
// in the Brand agent's system prompt. Workspaces not listed skip the
// fetch + prompt section entirely. Exists as a kill switch — if Brand
// ever produces odd output because of a bad edit in the cache, the
// workspace can be removed from this list without a deploy (env-var
// change + restart).
//
// Example:
//   PIPELINE_V2_WORKSPACES=ws_internal,ws_beta_customer
//   BRAND_FEEDBACK_WORKSPACES=ws_internal
//
// Parsing rules:
//   - Trim whitespace around each entry.
//   - Drop empty entries.
//   - Exact, case-sensitive match against the caller-provided workspaceId.

export function parseWorkspaceAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return new Set(entries);
}

export function isPipelineV2Enabled(
  workspaceId: string,
  raw: string | undefined = process.env.PIPELINE_V2_WORKSPACES
): boolean {
  if (!workspaceId) return false;
  return parseWorkspaceAllowlist(raw).has(workspaceId);
}

export function isBrandFeedbackEnabled(
  workspaceId: string,
  raw: string | undefined = process.env.BRAND_FEEDBACK_WORKSPACES
): boolean {
  if (!workspaceId) return false;
  return parseWorkspaceAllowlist(raw).has(workspaceId);
}
