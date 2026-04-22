// Helper for building manager_edits insert rows.
//
// Pure so the API route test can assert shape without touching Supabase.
// buildEditInsert returns null when before === after so the caller can
// skip no-op "edits" without cluttering the table.

import type { ManagerEdit, ManagerEditField } from "@/lib/types";

export interface ManagerEditInsert {
  asset_id: string;
  user_id: string;
  field: ManagerEditField;
  before: string;
  after: string;
}

export interface BuildEditInsertParams {
  assetId: string;
  userId: string;
  field: ManagerEditField;
  before: string;
  after: string;
}

export function buildEditInsert(params: BuildEditInsertParams): ManagerEditInsert | null {
  if (params.before === params.after) return null;
  return {
    asset_id: params.assetId,
    user_id: params.userId,
    field: params.field,
    before: params.before,
    after: params.after
  };
}

export type { ManagerEdit };
