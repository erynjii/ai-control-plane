// Feature-flag helpers.
//
// PIPELINE_V2_WORKSPACES: comma-separated list of workspace ids that should
// execute the multi-agent v2 pipeline in /api/generate-post. Workspaces not
// listed continue to run the byte-identical v1 code path.
//
// Example:
//   PIPELINE_V2_WORKSPACES=ws_internal,ws_beta_customer
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
