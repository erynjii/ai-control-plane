import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdapter, isDestination } from "@/lib/integrations";

const ASSET_SELECT =
  "id, workspace_id, prompt, system_prompt, output, model, status, risk_level, scan_findings, promoted, conversation_id, destination, destination_status, destination_meta, published_at, failure_reason, created_at, updated_at";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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

  if (existing.destination_status !== "failed") {
    return NextResponse.json(
      { error: "Only failed publishes can be retried." },
      { status: 409 }
    );
  }

  if (!isDestination(existing.destination)) {
    return NextResponse.json(
      { error: "No destination set to retry." },
      { status: 409 }
    );
  }

  const adapter = getAdapter(existing.destination);
  const publishInput = { assetId: existing.id, content: existing.output };

  const queueResult = await adapter.queuePublish(publishInput);
  const queuedMeta = { ...existing.destination_meta, queue: queueResult.meta };
  const queuedAt = new Date().toISOString();

  await supabase
    .from("assets")
    .update({
      destination_status: "queued",
      destination_meta: queuedMeta,
      status: "queued",
      failure_reason: null,
      updated_at: queuedAt
    })
    .eq("id", existing.id);

  await supabase.from("audit_events").insert([
    {
      asset_id: existing.id,
      user_id: user.id,
      action: "retry_triggered",
      metadata: { destination: existing.destination }
    },
    {
      asset_id: existing.id,
      user_id: user.id,
      action: "queued",
      metadata: { destination: existing.destination, ...queueResult.meta }
    }
  ]);

  // Transition: publishing
  const publishingAt = new Date().toISOString();
  await supabase
    .from("assets")
    .update({ destination_status: "publishing", updated_at: publishingAt })
    .eq("id", existing.id);

  await supabase.from("audit_events").insert({
    asset_id: existing.id,
    user_id: user.id,
    action: "publish_started",
    metadata: { destination: existing.destination, retry: true }
  });

  const publishResult = await adapter.publish(publishInput);
  const now = new Date().toISOString();

  if (publishResult.ok) {
    const successMeta = {
      ...queuedMeta,
      publish: { externalId: publishResult.externalId, ...publishResult.meta }
    };

    const { data: updated, error: updateError } = await supabase
      .from("assets")
      .update({
        destination_status: "published",
        destination_meta: successMeta,
        status: "published",
        published_at: now,
        failure_reason: null,
        updated_at: now
      })
      .eq("id", existing.id)
      .select(ASSET_SELECT)
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: "Publish succeeded but update failed." }, { status: 500 });
    }

    await supabase.from("audit_events").insert({
      asset_id: existing.id,
      user_id: user.id,
      action: "publish_succeeded",
      metadata: {
        destination: existing.destination,
        externalId: publishResult.externalId,
        retry: true,
        ...publishResult.meta
      }
    });

    return NextResponse.json({ asset: updated });
  }

  const { data: failed, error: failUpdateError } = await supabase
    .from("assets")
    .update({
      destination_status: "failed",
      status: "failed",
      failure_reason: publishResult.reason,
      updated_at: now
    })
    .eq("id", existing.id)
    .select(ASSET_SELECT)
    .single();

  if (failUpdateError || !failed) {
    return NextResponse.json({ error: "Publish failed and update failed." }, { status: 500 });
  }

  await supabase.from("audit_events").insert({
    asset_id: existing.id,
    user_id: user.id,
    action: "publish_failed",
    metadata: { destination: existing.destination, reason: publishResult.reason, retry: true }
  });

  return NextResponse.json({ asset: failed });
}
