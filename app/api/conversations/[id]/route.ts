import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200)
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [{ data: conversation, error: convError }, { data: assets, error: assetsError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .eq("id", params.id)
      .single(),
    supabase
      .from("assets")
      .select(
        "id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, promoted, conversation_id, destination, destination_status, destination_meta, published_at, failure_reason, created_at, updated_at"
      )
      .eq("conversation_id", params.id)
      .order("created_at", { ascending: true })
  ]);

  if (convError || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (assetsError) {
    return NextResponse.json({ error: "Failed to load conversation assets." }, { status: 500 });
  }

  return NextResponse.json({ conversation, assets: assets ?? [] });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parsedBody = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message || "Invalid request." },
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

  const { data, error } = await supabase
    .from("conversations")
    .update({ title: parsedBody.data.title, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update conversation." }, { status: 404 });
  }

  return NextResponse.json({ conversation: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase.from("conversations").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete conversation." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
