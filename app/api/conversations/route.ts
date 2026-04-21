import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200)
});

export async function GET() {
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
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load conversations." }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  const parsedBody = createSchema.safeParse(await request.json().catch(() => ({})));
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
    .insert({ user_id: user.id, title: parsedBody.data.title })
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
