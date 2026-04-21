import { NextResponse } from "next/server";
import { z } from "zod";
import { MODEL_MODES, resolveModelForMode } from "@/lib/ai/model-mapping";
import { generateImageWithOpenAI } from "@/lib/ai/image";
import { scanContent } from "@/lib/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ASSET_SELECT } from "@/lib/assets/select";
import { buildMediaPath, uploadMediaObject } from "@/lib/media/storage";

const MAX_CONVERSATION_TITLE_LENGTH = 80;

const INSTAGRAM_SYSTEM_PROMPT = `You are an Instagram content strategist. Given a user's request, create an Instagram post.
Return a JSON object with exactly two fields:
- "caption": The complete Instagram caption including relevant hashtags (max 2200 chars)
- "imagePrompt": A detailed prompt for generating an accompanying image. Be specific about style, composition, colors, mood, and subject. Do not include text in the image.
Respond with only the JSON object, no other text.`;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  modelMode: z.enum(MODEL_MODES),
  systemPrompt: z.string().trim().min(1).optional(),
  workspaceId: z.string().trim().min(1).default("default-workspace"),
  conversationId: z.string().uuid().optional(),
  accessToken: z.string().optional()
});

type OpenAIChatCompletionPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

type InstagramPayload = {
  caption: string;
  imagePrompt: string;
};

function deriveTitle(firstUserMessage: string): string {
  const collapsed = firstUserMessage.trim().replace(/\s+/g, " ");
  if (collapsed.length <= MAX_CONVERSATION_TITLE_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_CONVERSATION_TITLE_LENGTH - 1).trimEnd()}…`;
}

function parseInstagramJson(raw: string): InstagramPayload | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const caption = parsed.caption;
    const imagePrompt = parsed.imagePrompt;
    if (typeof caption !== "string" || typeof imagePrompt !== "string") return null;
    if (!caption.trim() || !imagePrompt.trim()) return null;
    return { caption: caption.trim(), imagePrompt: imagePrompt.trim() };
  } catch {
    return null;
  }
}

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

  const { prompt, modelMode, systemPrompt, workspaceId, conversationId: providedConversationId } = parsedBody.data;
  const effectiveSystemPrompt = systemPrompt ?? INSTAGRAM_SYSTEM_PROMPT;

  let conversationId = providedConversationId ?? null;
  if (!conversationId) {
    const { data: newConversation, error: convError } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: deriveTitle(prompt) })
      .select("id")
      .single();

    if (convError || !newConversation) {
      return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
    }
    conversationId = newConversation.id;
  }

  const selectedModel = resolveModelForMode(modelMode);

  // Step 1: caption + imagePrompt via JSON-mode chat completion.
  const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: effectiveSystemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!completionResponse.ok) {
    const errorBody = await completionResponse.text();
    console.error("generate-post chat completion failed", completionResponse.status, errorBody);
    return NextResponse.json(
      { error: `OpenAI ${completionResponse.status}: ${errorBody || "Unknown error"}` },
      { status: 502 }
    );
  }

  const completionPayload = (await completionResponse.json()) as OpenAIChatCompletionPayload;
  const rawContent = completionPayload.choices?.[0]?.message?.content?.trim() ?? "";
  const instagram = parseInstagramJson(rawContent);

  if (!instagram) {
    return NextResponse.json(
      { error: "Assistant did not return valid JSON with caption and imagePrompt." },
      { status: 502 }
    );
  }

  // Step 2: image.
  let image;
  try {
    image = await generateImageWithOpenAI({ apiKey, prompt: instagram.imagePrompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    console.error("generate-post image failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const scan = scanContent({ prompt, output: instagram.caption });
  const now = new Date().toISOString();

  // Step 3: insert asset first so we have an id for the media path.
  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      prompt,
      system_prompt: effectiveSystemPrompt,
      output: instagram.caption,
      model: selectedModel,
      status: "draft",
      risk_level: scan.riskLevel,
      scan_findings: scan.findings,
      promoted: false,
      conversation_id: conversationId,
      media_type: "image",
      media_prompt: instagram.imagePrompt,
      created_at: now,
      updated_at: now
    })
    .select(ASSET_SELECT)
    .single();

  if (insertError || !asset) {
    return NextResponse.json({ error: "Failed to save generated asset." }, { status: 500 });
  }

  let mediaUrl: string;
  try {
    const path = buildMediaPath(user.id, asset.id, "png");
    const uploaded = await uploadMediaObject(supabase, path, image.buffer, image.contentType);
    mediaUrl = uploaded.publicUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media upload failed.";
    console.error("generate-post media upload failed", message);
    return NextResponse.json({ error: message, asset }, { status: 502 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("assets")
    .update({ media_url: mediaUrl, updated_at: new Date().toISOString() })
    .eq("id", asset.id)
    .select(ASSET_SELECT)
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to attach media URL." }, { status: 500 });
  }

  await supabase
    .from("conversations")
    .update({ updated_at: now })
    .eq("id", conversationId);

  return NextResponse.json({
    output: instagram.caption,
    imagePrompt: instagram.imagePrompt,
    imageUrl: mediaUrl,
    asset: updated,
    scan,
    conversationId
  });
}
