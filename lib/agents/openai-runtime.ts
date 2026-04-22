// Production AgentRuntime: thin adapter over OpenAI chat completions +
// existing image helper + Supabase Storage. Tests never instantiate this;
// they pass stubRuntime from test-utils.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRuntime, ChatRequest, ChatResponse, ImageRequest, ImageResponse } from "@/lib/agents/runtime";
import { imageCost } from "@/lib/agents/pricing";
import { fetchBrandEditsForWorkspace } from "@/lib/agents/brand-feedback";
import { generateImageWithOpenAI } from "@/lib/ai/image";
import { buildMediaPath, uploadMediaObject } from "@/lib/media/storage";
import type { BrandEditHistoryEntry } from "@/lib/types";

interface OpenAIChatPayload {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  model?: string;
  error?: { message?: string };
}

export interface OpenAIRuntimeOptions {
  apiKey: string;
  supabase: SupabaseClient;
  userId: string;
  postId: string;
}

export function createOpenAIRuntime(options: OpenAIRuntimeOptions): AgentRuntime {
  async function chat(req: ChatRequest): Promise<ChatResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: req.model,
        response_format: { type: "json_object" },
        temperature: req.temperature ?? 0.7,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user }
        ]
      })
    });

    const payload = (await response.json().catch(() => null)) as OpenAIChatPayload | null;
    if (!response.ok || !payload) {
      const message = payload?.error?.message ?? `OpenAI ${response.status}`;
      throw new Error(message);
    }
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      text,
      model: payload.model ?? req.model,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0
    };
  }

  async function fetchBrandEdits(workspaceId: string): Promise<BrandEditHistoryEntry[]> {
    return fetchBrandEditsForWorkspace(options.supabase, workspaceId);
  }

  async function image(req: ImageRequest): Promise<ImageResponse> {
    const generated = await generateImageWithOpenAI({
      apiKey: options.apiKey,
      prompt: req.prompt,
      size: req.size
    });
    const path = buildMediaPath(options.userId, options.postId, "png");
    const uploaded = await uploadMediaObject(
      options.supabase,
      path,
      generated.buffer,
      generated.contentType
    );
    return {
      imageUrl: uploaded.publicUrl,
      model: "gpt-image-1",
      costUsd: imageCost({ model: "gpt-image-1" })
    };
  }

  return { chat, image, fetchBrandEdits };
}
