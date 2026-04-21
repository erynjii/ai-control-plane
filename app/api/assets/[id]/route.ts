import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REVIEW_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;

const patchSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).optional(),
    promoted: z.boolean().optional()
  })
  .refine((data) => data.status !== undefined || data.promoted !== undefined, {
    message: "Must provide status or promoted."
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

  const updatePayload: { status?: string; promoted?: boolean; updated_at: string } = {
    updated_at: new Date().toISOString()
  };
  if (parsedBody.data.status !== undefined) updatePayload.status = parsedBody.data.status;
  if (parsedBody.data.promoted !== undefined) updatePayload.promoted = parsedBody.data.promoted;

  const { data, error } = await supabase
    .from("assets")
    .update(updatePayload)
    .eq("id", params.id)
    .select(
      "id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, promoted, conversation_id, destination, destination_status, destination_meta, published_at, failure_reason, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update asset." }, { status: 404 });
  }

  return NextResponse.json({ asset: data });
}
