import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DESTINATIONS, getAdapter } from "@/lib/integrations";

const ASSET_SELECT =
  "id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, promoted, conversation_id, destination, destination_status, destination_meta, published_at, failure_reason, created_at, updated_at";

const REASSIGNABLE_STATUSES = new Set(["idle", "assigned", "failed"]);

const patchSchema = z.object({
  destination: z.enum(DESTINATIONS)
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

  const { data: existing, error: fetchError } = await supabase
    .from("assets")
    .select(ASSET_SELECT)
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  if (existing.status !== "approved") {
    return NextResponse.json(
      { error: "Destination can only be assigned to approved assets." },
      { status: 409 }
    );
  }

  if (!REASSIGNABLE_STATUSES.has(existing.destination_status)) {
    return NextResponse.json(
      { error: `Cannot reassign destination while publish is ${existing.destination_status}.` },
      { status: 409 }
    );
  }

  const adapter = getAdapter(parsedBody.data.destination);
  const assignResult = await adapter.assignDestination({
    assetId: existing.id,
    content: existing.output
  });

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("assets")
    .update({
      destination: parsedBody.data.destination,
      destination_status: "assigned",
      destination_meta: assignResult.meta,
      failure_reason: null,
      updated_at: now
    })
    .eq("id", params.id)
    .select(ASSET_SELECT)
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to assign destination." }, { status: 500 });
  }

  await supabase.from("audit_events").insert({
    asset_id: updated.id,
    user_id: user.id,
    action: "destination_assigned",
    metadata: { destination: parsedBody.data.destination, ...assignResult.meta }
  });

  return NextResponse.json({ asset: updated });
}
