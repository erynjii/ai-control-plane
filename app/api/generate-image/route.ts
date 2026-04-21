import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateImageWithOpenAI } from "@/lib/ai/image";
import { buildMediaPath, uploadMediaObject } from "@/lib/media/storage";

const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  size: z.enum(ALLOWED_SIZES).optional(),
  assetId: z.string().uuid().optional(),
  accessToken: z.string().optional()
});

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message || "Invalid request." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const image = await generateImageWithOpenAI({
      apiKey,
      prompt: parsedBody.data.prompt,
      size: parsedBody.data.size
    });

    const pathKey = parsedBody.data.assetId ?? "ad-hoc";
    const path = buildMediaPath(user.id, pathKey, "png");
    const uploaded = await uploadMediaObject(supabase, path, image.buffer, image.contentType);

    return NextResponse.json({
      imageUrl: uploaded.publicUrl,
      path: uploaded.path,
      prompt: parsedBody.data.prompt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    console.error("generate-image failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
