import { NextResponse } from "next/server";
import { z } from "zod";
import { MODEL_MODES, resolveModelForMode } from "@/lib/ai/model-mapping";
import { scanContent } from "@/lib/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt cannot be empty."),
  modelMode: z.enum(MODEL_MODES),
  workspaceId: z.string().trim().min(1).default("default-workspace")
});

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
};

function getOutputText(payload: OpenAIResponsePayload): string {
  if (payload.output_text && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const nestedText = payload.output?.flatMap((entry) => entry.content ?? []).map((entry) => entry.text ?? "").join("\n").trim();

  return nestedText || "No output returned.";
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

  const { prompt, modelMode, workspaceId } = parsedBody.data;

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const selectedModel = resolveModelForMode(modelMode);

  const completionResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      input: `You are a marketing content assistant.\n\nUser prompt:\n${prompt}`
    })
  });

  if (!completionResponse.ok) {
    return NextResponse.json({ error: "Failed to generate content." }, { status: 502 });
  }

  const completionPayload = (await completionResponse.json()) as OpenAIResponsePayload;
  const outputText = getOutputText(completionPayload);
  const scan = scanContent({ prompt, output: outputText });
  const now = new Date().toISOString();

  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      prompt,
      output: outputText,
      model: selectedModel,
      status: "draft",
      risk_level: scan.riskLevel,
      scan_findings: scan.findings,
      created_at: now,
      updated_at: now
    })
    .select("id, workspace_id, user_id, prompt, output, model, status, risk_level, scan_findings, created_at, updated_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to save generated asset." }, { status: 500 });
  }

  return NextResponse.json({ output: outputText, asset, scan });
}
