import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "media";

export type UploadedMedia = {
  path: string;
  publicUrl: string;
};

export async function uploadMediaObject(
  supabase: SupabaseClient,
  path: string,
  body: Buffer | Uint8Array | Blob,
  contentType: string
): Promise<UploadedMedia> {
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, body, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export function buildMediaPath(userId: string, assetId: string, extension: string): string {
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "") || "bin";
  return `${userId}/${assetId}/${Date.now()}.${safeExt}`;
}
