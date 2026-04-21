import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSET_STATUSES } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  status: z.enum(ASSET_STATUSES)
});

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
    .from("assets")
    .update({
      status: parsedBody.data.status,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.id)
    .select("id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update asset." }, { status: 404 });
  }

  return NextResponse.json({ asset: data });
}
