// Pre-aggregate flag severity so we can cheaply sort/filter the approval
// queue on a single indexed column (pipeline_runs.max_flag_severity) instead
// of scanning context->'flags' on every list view.

import type { AgentFlag, FlagSeverity } from "@/lib/agents/types";

const RANK: Record<FlagSeverity, number> = { note: 1, warning: 2, blocker: 3 };

export function resolveMaxFlagSeverity(flags: AgentFlag[]): FlagSeverity | null {
  if (flags.length === 0) return null;
  let top: FlagSeverity = "note";
  for (const flag of flags) {
    if (RANK[flag.severity] > RANK[top]) top = flag.severity;
  }
  return top;
}
