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
  promoted: boolean;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ConversationWithAssets = Conversation & {
  assets: Asset[];
};
