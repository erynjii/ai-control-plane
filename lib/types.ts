import type { ScanFinding } from "@/lib/scan";

export const ASSET_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type Asset = {
  id: string;
  workspace_id: string;
  prompt: string;
  system_prompt: string | null;
  output: string;
  model: string;
  status: string;
  risk_level: string;
  scan_findings: ScanFinding[];
  created_at: string;
  updated_at: string;
};
