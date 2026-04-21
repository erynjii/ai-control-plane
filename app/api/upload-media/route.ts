import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildMediaPath, uploadMediaObject } from "@/lib/media/storage";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

const VIDEO_MIME_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

function resolveMimeInfo(type: string): { mediaType: "image" | "video"; ext: string } | null {
  if (IMAGE_MIME_TO_EXT[type]) return { mediaType: "image", ext: IMAGE_MIME_TO_EXT[type] };
  if (VIDEO_MIME_TO_EXT[type]) return { mediaType: "video", ext: VIDEO_MIME_TO_EXT[type] };
  return null;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  const assetIdValue = formData.get("assetId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds 50MB limit." }, { status: 400 });
  }

  const mimeInfo = resolveMimeInfo(file.type);
  if (!mimeInfo) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: png, jpg, webp, mp4, mov, webm." },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const assetId = typeof assetIdValue === "string" && assetIdValue ? assetIdValue : "ad-hoc";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const path = buildMediaPath(user.id, assetId, mimeInfo.ext);
    const uploaded = await uploadMediaObject(supabase, path, buffer, file.type);

    return NextResponse.json({
      mediaUrl: uploaded.publicUrl,
      mediaType: mimeInfo.mediaType,
      path: uploaded.path
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
