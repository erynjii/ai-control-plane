import { NextResponse } from "next/server";
import { z } from "zod";
import { MODEL_MODES, resolveModelForMode } from "@/lib/ai/model-mapping";
import { scanContent } from "@/lib/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_SYSTEM_PROMPT = "You are a marketing content assistant.";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

const requestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1, "messages cannot be empty"),
    systemPrompt: z.string().trim().min(1).default(DEFAULT_SYSTEM_PROMPT),
    modelMode: z.enum(MODEL_MODES),
    workspaceId: z.string().trim().min(1).default("default-workspace")
  })
  .refine((data) => data.messages[data.messages.length - 1].role === "user", {
    message: "The last message must be from the user.",
    path: ["messages"]
  });

type OpenAIChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function getOutputText(payload: OpenAIChatCompletionPayload): string {
  const content = payload.choices?.[0]?.message?.content?.trim();
  return content || "No output returned.";
}

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message || "Invalid request." }, { status: 400 });
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!openAiApiKey) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  }

  const { messages, systemPrompt, modelMode, workspaceId } = parsedBody.data;
  const lastUserMessage = messages[messages.length - 1].content;

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const selectedModel = resolveModelForMode(modelMode);

  const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages]
    })
  });

  if (!completionResponse.ok) {
    const errorBody = await completionResponse.text();
    let detail = errorBody;
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
      detail = parsed.error?.message || errorBody;
    } catch {
      // Response was not JSON; keep raw body.
    }
    console.error("OpenAI request failed", { status: completionResponse.status, detail });
    return NextResponse.json(
      { error: `OpenAI ${completionResponse.status}: ${detail || "Unknown error"}` },
      { status: 502 }
    );
  }

  const completionPayload = (await completionResponse.json()) as OpenAIChatCompletionPayload;
  const outputText = getOutputText(completionPayload);
  const scan = scanContent({ prompt: lastUserMessage, output: outputText });
  const now = new Date().toISOString();

  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      prompt: lastUserMessage,
      system_prompt: systemPrompt,
      output: outputText,
      model: selectedModel,
      status: "draft",
      risk_level: scan.riskLevel,
      scan_findings: scan.findings,
      promoted: false,
      created_at: now,
      updated_at: now
    })
    .select("id, workspace_id, user_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, promoted, created_at, updated_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to save generated asset." }, { status: 500 });
  }

  return NextResponse.json({ output: outputText, asset, scan });
}
