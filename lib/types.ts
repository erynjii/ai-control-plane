import type { ScanFinding } from "@/lib/scan";

export type Asset = {
  id: string;
  workspace_id: string;
  prompt: string;
  output: string;
  model: string;
  status: string;
  risk_level: string;
  scan_findings: ScanFinding[];
  created_at: string;
  updated_at: string;
};
