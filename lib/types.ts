import type { ScanFinding } from "@/lib/scan";
import type { Destination, DestinationStatus } from "@/lib/integrations/types";

export const ASSET_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "queued",
  "published",
  "failed"
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export type MediaType = "image" | "video";

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
  destination: Destination | null;
  destination_status: DestinationStatus;
  destination_meta: Record<string, unknown>;
  published_at: string | null;
  failure_reason: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  media_prompt: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditEvent = {
  id: string;
  asset_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ManagerEditField = "output";

export type ManagerEdit = {
  id: string;
  asset_id: string;
  user_id: string;
  field: ManagerEditField;
  before: string;
  after: string;
  edited_at: string;
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
