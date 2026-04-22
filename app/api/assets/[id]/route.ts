import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ASSET_SELECT } from "@/lib/assets/select";
import { buildEditInsert } from "@/lib/agents/edits";

const REVIEW_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;
const MEDIA_TYPES = ["image", "video"] as const;
const EDITABLE_STATUSES = new Set<string>(["draft", "pending_review"]);

const patchSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).optional(),
    promoted: z.boolean().optional(),
    output: z.string().min(1).max(10000).optional(),
    media_url: z.string().url().nullable().optional(),
    media_type: z.enum(MEDIA_TYPES).nullable().optional(),
    media_prompt: z.string().min(1).max(4000).nullable().optional()
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.promoted !== undefined ||
      data.output !== undefined ||
      data.media_url !== undefined ||
      data.media_type !== undefined ||
      data.media_prompt !== undefined,
    { message: "Must provide at least one field to update." }
  );

type UpdatePayload = {
  status?: string;
  promoted?: boolean;
  output?: string;
  media_url?: string | null;
  media_type?: string | null;
  media_prompt?: string | null;
  updated_at: string;
};

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

  const needsContentCheck =
    parsedBody.data.output !== undefined ||
    parsedBody.data.media_url !== undefined ||
    parsedBody.data.media_type !== undefined ||
    parsedBody.data.media_prompt !== undefined;

  // Capture the prior output when the caller is editing it, so we can
  // record the diff into manager_edits after the update succeeds.
  let priorOutput: string | undefined;

  if (needsContentCheck) {
    const columns =
      parsedBody.data.output !== undefined ? "status, output" : "status";
    const { data: existing, error: fetchError } = await supabase
      .from("assets")
      .select(columns)
      .eq("id", params.id)
      .single<{ status: string; output?: string }>();
    if (fetchError || !existing) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }
    if (!EDITABLE_STATUSES.has(existing.status)) {
      return NextResponse.json(
        { error: `Content cannot be edited while status is ${existing.status}.` },
        { status: 409 }
      );
    }
    if (parsedBody.data.output !== undefined) {
      priorOutput = existing.output;
    }
  }

  const updatePayload: UpdatePayload = { updated_at: new Date().toISOString() };
  if (parsedBody.data.status !== undefined) updatePayload.status = parsedBody.data.status;
  if (parsedBody.data.promoted !== undefined) updatePayload.promoted = parsedBody.data.promoted;
  if (parsedBody.data.output !== undefined) updatePayload.output = parsedBody.data.output;
  if (parsedBody.data.media_url !== undefined) updatePayload.media_url = parsedBody.data.media_url;
  if (parsedBody.data.media_type !== undefined) updatePayload.media_type = parsedBody.data.media_type;
  if (parsedBody.data.media_prompt !== undefined) updatePayload.media_prompt = parsedBody.data.media_prompt;

  const { data, error } = await supabase
    .from("assets")
    .update(updatePayload)
    .eq("id", params.id)
    .select(ASSET_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to update asset." }, { status: 404 });
  }

  // Record the caption edit into manager_edits. Non-transactional with the
  // assets update (matches the rest of the codebase's PostgREST writes).
  // TODO(cross-table-atomicity): promote to an RPC when we migrate every
  // audit-style write off PostgREST. Tracked alongside PR 1/2 notes.
  if (parsedBody.data.output !== undefined && priorOutput !== undefined) {
    const editRow = buildEditInsert({
      assetId: params.id,
      userId: user.id,
      field: "output",
      before: priorOutput,
      after: parsedBody.data.output
    });
    if (editRow) {
      const { error: editError } = await supabase.from("manager_edits").insert(editRow);
      if (editError) {
        console.error("manager_edits insert failed", editError);
      }
    }
  }

  return NextResponse.json({ asset: data });
}
