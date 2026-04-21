import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SeedAudit = {
  action: string;
  metadata: Record<string, unknown>;
  offsetMs: number;
};

type SeedAsset = {
  prompt: string;
  output: string;
  status: "draft" | "pending_review" | "approved" | "rejected" | "queued" | "published" | "failed";
  risk_level: "low" | "medium" | "high";
  promoted: boolean;
  destination: "instagram" | "facebook" | "email" | "website" | null;
  destination_status: "idle" | "assigned" | "queued" | "publishing" | "published" | "failed";
  destination_meta: Record<string, unknown>;
  published_at_offset_ms: number | null;
  failure_reason: string | null;
  created_offset_ms: number;
  audits: SeedAudit[];
};

type SeedConversation = {
  title: string;
  created_offset_ms: number;
  assets: SeedAsset[];
};

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const MOCK_MODEL = "gpt-4o-mini";
const WORKSPACE_ID = "default-workspace";

const SEED: SeedConversation[] = [
  {
    title: "Instagram Marketing Campaign",
    created_offset_ms: 6 * HOUR,
    assets: [
      {
        prompt: "Create an Instagram post promoting our head spa grand opening in Miami",
        output:
          "🌴✨ Miami, your scalp oasis has arrived ✨🌴\n\nWe're thrilled to announce the **Grand Opening** of our luxury head spa in the heart of Brickell.\n\n💆‍♀️ Signature scalp rituals\n💧 Deep hydration + botanical steam\n🧘‍♀️ Pressure-point massage\n\n🎉 20% off every first-time service this week only.\n\n📍 Brickell, Miami · Open daily 10am–8pm\n🔗 Book your escape — link in bio.\n\n#MiamiSpa #HeadSpa #ScalpCare #GrandOpening #LuxuryWellness",
        status: "approved",
        risk_level: "low",
        promoted: true,
        destination: "instagram",
        destination_status: "published",
        destination_meta: {
          platform: "instagram",
          permalink: "https://instagram.com/p/ig_mock_post_001",
          postId: "ig_post_mock_001"
        },
        published_at_offset_ms: 2 * HOUR,
        failure_reason: null,
        created_offset_ms: 6 * HOUR,
        audits: [
          { action: "destination_assigned", metadata: { destination: "instagram", account: "@mock-brand" }, offsetMs: 5 * HOUR + 30 * MINUTE },
          { action: "queued", metadata: { destination: "instagram", queueId: "ig_queue_mock_001" }, offsetMs: 2 * HOUR + 5 * MINUTE },
          { action: "publish_started", metadata: { destination: "instagram" }, offsetMs: 2 * HOUR + 2 * MINUTE },
          {
            action: "publish_succeeded",
            metadata: {
              destination: "instagram",
              externalId: "ig_post_mock_001",
              permalink: "https://instagram.com/p/ig_mock_post_001"
            },
            offsetMs: 2 * HOUR
          }
        ]
      },
      {
        prompt: "Now write a follow-up story post for the same campaign",
        output:
          "Day one at our new Miami head spa 💆‍♀️✨\n\nSwipe up to book your first visit and claim **20% off** your signature scalp ritual.\n\n📍 Brickell · 🕒 10am–8pm\n\n#MiamiHeadSpa",
        status: "approved",
        risk_level: "low",
        promoted: true,
        destination: "instagram",
        destination_status: "queued",
        destination_meta: {
          platform: "instagram",
          queueId: "ig_queue_mock_002"
        },
        published_at_offset_ms: null,
        failure_reason: null,
        created_offset_ms: 45 * MINUTE,
        audits: [
          { action: "destination_assigned", metadata: { destination: "instagram", account: "@mock-brand" }, offsetMs: 35 * MINUTE },
          { action: "queued", metadata: { destination: "instagram", queueId: "ig_queue_mock_002" }, offsetMs: 25 * MINUTE }
        ]
      }
    ]
  },
  {
    title: "Email Campaign",
    created_offset_ms: 8 * HOUR,
    assets: [
      {
        prompt: "Write an email campaign for our new scalp treatment service",
        output:
          "**Subject:** Introducing our Signature Scalp Renewal — 25% off for you\n\nHi {first_name},\n\nWe're excited to share something special: our brand-new **Signature Scalp Renewal Treatment** launches this week.\n\nWhat's inside your 60-minute ritual:\n- Deep hydrating scalp cleanse\n- Microbiome-balancing serum\n- Pressure-point massage\n- Botanical steam finish\n\n👉 Book your 25% off appointment: [Reserve a time](#)\n\nSee you soon,\nThe Team",
        status: "approved",
        risk_level: "medium",
        promoted: true,
        destination: "email",
        destination_status: "failed",
        destination_meta: {
          platform: "email",
          list: "mock-newsletter-list",
          queueId: "email_queue_mock_001"
        },
        published_at_offset_ms: null,
        failure_reason: "Recipient list empty",
        created_offset_ms: 8 * HOUR,
        audits: [
          { action: "destination_assigned", metadata: { destination: "email", list: "mock-newsletter-list" }, offsetMs: 7 * HOUR },
          { action: "queued", metadata: { destination: "email", queueId: "email_queue_mock_001" }, offsetMs: 5 * HOUR + 10 * MINUTE },
          { action: "publish_started", metadata: { destination: "email" }, offsetMs: 5 * HOUR + 5 * MINUTE },
          {
            action: "publish_failed",
            metadata: { destination: "email", reason: "Recipient list empty" },
            offsetMs: 5 * HOUR
          }
        ]
      }
    ]
  },
  {
    title: "Product Ad Copy",
    created_offset_ms: 3 * HOUR,
    assets: [
      {
        prompt: "Write Facebook ad copy for our premium hair treatment package",
        output:
          "**Hair that feels (and looks) brand new.**\n\nOur Premium Hair Restoration Package is the all-in-one ritual your strands have been asking for — cleanse, treat, nourish, and protect in a single 90-minute session.\n\n✨ Personalized to your hair type\n✨ Visible, immediate results\n✨ Expert-led, spa-inspired care\n\nLimited slots this month — **book now and save 15%**.",
        status: "pending_review",
        risk_level: "low",
        promoted: true,
        destination: "facebook",
        destination_status: "assigned",
        destination_meta: {
          platform: "facebook",
          page: "mock-brand-page"
        },
        published_at_offset_ms: null,
        failure_reason: null,
        created_offset_ms: 3 * HOUR,
        audits: [
          { action: "destination_assigned", metadata: { destination: "facebook", page: "mock-brand-page" }, offsetMs: 2 * HOUR + 40 * MINUTE }
        ]
      },
      {
        prompt: "Create website landing page copy for the same service",
        output:
          "# Premium Hair Restoration, Reimagined\n\nGive your hair the attention it deserves with our signature 90-minute ritual. Our certified technicians blend cutting-edge scalp science with calming, spa-inspired care — so every visit feels as restorative as it looks.\n\n## What's Included\n- Full consultation & hair diagnosis\n- Deep cleansing & pre-treatment oil ritual\n- Nutrient-rich hydration mask\n- Finishing protective serum\n\n## Why Clients Choose Us\n- Personalized treatment plans\n- Premium, science-backed products\n- Private, relaxing treatment rooms\n\nBook your Premium Hair Restoration experience today — we can't wait to meet you.",
        status: "draft",
        risk_level: "low",
        promoted: false,
        destination: null,
        destination_status: "idle",
        destination_meta: {},
        published_at_offset_ms: null,
        failure_reason: null,
        created_offset_ms: 20 * MINUTE,
        audits: []
      }
    ]
  }
];

function isoAtOffset(nowMs: number, offsetMs: number): string {
  return new Date(nowMs - offsetMs).toISOString();
}

export async function POST() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { count, error: countError } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) {
    return NextResponse.json({ error: "Failed to check existing data." }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ seeded: false, reason: "User already has conversations." });
  }

  const nowMs = Date.now();
  let conversationsInserted = 0;
  let assetsInserted = 0;
  let auditsInserted = 0;

  for (const conv of SEED) {
    const convCreatedIso = isoAtOffset(nowMs, conv.created_offset_ms);
    const convUpdatedIso = isoAtOffset(
      nowMs,
      Math.max(0, ...conv.assets.flatMap((a) => [a.created_offset_ms, ...a.audits.map((e) => e.offsetMs)]))
    );

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: conv.title,
        created_at: convCreatedIso,
        updated_at: convUpdatedIso
      })
      .select("id")
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: "Failed to seed conversation." }, { status: 500 });
    }
    conversationsInserted += 1;

    for (const asset of conv.assets) {
      const assetCreatedIso = isoAtOffset(nowMs, asset.created_offset_ms);
      const assetUpdatedIso =
        asset.audits.length > 0
          ? isoAtOffset(nowMs, Math.min(...asset.audits.map((e) => e.offsetMs)))
          : assetCreatedIso;

      const { data: insertedAsset, error: assetError } = await supabase
        .from("assets")
        .insert({
          workspace_id: WORKSPACE_ID,
          user_id: user.id,
          prompt: asset.prompt,
          system_prompt: null,
          output: asset.output,
          model: MOCK_MODEL,
          status: asset.status,
          risk_level: asset.risk_level,
          scan_findings: [],
          promoted: asset.promoted,
          conversation_id: conversation.id,
          destination: asset.destination,
          destination_status: asset.destination_status,
          destination_meta: asset.destination_meta,
          published_at:
            asset.published_at_offset_ms === null
              ? null
              : isoAtOffset(nowMs, asset.published_at_offset_ms),
          failure_reason: asset.failure_reason,
          created_at: assetCreatedIso,
          updated_at: assetUpdatedIso
        })
        .select("id")
        .single();

      if (assetError || !insertedAsset) {
        return NextResponse.json({ error: "Failed to seed asset." }, { status: 500 });
      }
      assetsInserted += 1;

      if (asset.audits.length === 0) continue;

      const auditRows = asset.audits.map((evt) => ({
        asset_id: insertedAsset.id,
        user_id: user.id,
        action: evt.action,
        metadata: evt.metadata,
        created_at: isoAtOffset(nowMs, evt.offsetMs)
      }));

      const { error: auditError } = await supabase.from("audit_events").insert(auditRows);
      if (auditError) {
        return NextResponse.json({ error: "Failed to seed audit events." }, { status: 500 });
      }
      auditsInserted += auditRows.length;
    }
  }

  return NextResponse.json({
    seeded: true,
    conversations: conversationsInserted,
    assets: assetsInserted,
    auditEvents: auditsInserted
  });
}
