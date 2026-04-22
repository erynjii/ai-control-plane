import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOpenAIRuntime } from "@/lib/agents/openai-runtime";
import { regenerateAndPersist, type RegenerateStep } from "@/lib/agents/regenerate";
import type { PipelineContext, StrategyBrief } from "@/lib/agents/types";

// POST /api/assets/[id]/regenerate?step=<agent>
//
// Runs a partial re-generation of an existing v2 asset:
//   step=copy     — regenerate caption (preserves image)
//   step=photo    — regenerate image (preserves caption)
//   step=strategy — regenerate from a user-edited brief; body must include
//                   { briefOverride }. Cascades through copy + photo +
//                   brand + compliance.
//
// Returns { ok: true, runId, auditEventCount } on success. A new
// pipeline_runs row is inserted each time this runs; the assets row is
// updated in place.

const briefOverrideSchema = z.object({
  audience: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  contentPillar: z.string().trim().min(1),
  cta: z.object({
    type: z.string().trim().min(1),
    text: z.string().trim().min(1)
  }),
  hashtagClusters: z.array(z.string()).default([]),
  visualConcept: z.string().trim().min(1),
  optimalPostTime: z.string().optional(),
  constraints: z
    .object({
      bannedWords: z.array(z.string()).default([]),
      requiredDisclaimers: z.array(z.string()).default([]),
      platformLimits: z.object({
        maxChars: z.number(),
        maxHashtags: z.number()
      })
    })
    .optional()
});

const bodySchema = z.object({
  briefOverride: briefOverrideSchema.optional()
});

const STEPS: RegenerateStep[] = ["strategy", "copy", "photo"];

function isStep(value: string | null): value is RegenerateStep {
  return value !== null && (STEPS as string[]).includes(value);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const stepRaw = url.searchParams.get("step");
  if (!isStep(stepRaw)) {
    return NextResponse.json(
      { error: "Invalid step. Must be one of: strategy, copy, photo." },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request body." },
      { status: 400 }
    );
  }

  if (stepRaw === "strategy" && !parsed.data.briefOverride) {
    return NextResponse.json(
      { error: "step=strategy requires a briefOverride in the body." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 500 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Load the latest pipeline_run for the asset. RLS scopes this to the
  // caller's rows only; an unauthorised caller gets zero rows and a 404.
  const { data: runs, error: runError } = await supabase
    .from("pipeline_runs")
    .select("id, context, workspace_id, connected_account_id")
    .eq("asset_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (runError) {
    return NextResponse.json({ error: "Failed to load the latest pipeline run." }, { status: 500 });
  }
  if (!runs || runs.length === 0) {
    return NextResponse.json(
      { error: "Asset has no pipeline run to regenerate from." },
      { status: 404 }
    );
  }
  const latest = runs[0] as {
    id: string;
    context: PipelineContext;
    workspace_id: string;
    connected_account_id: string | null;
  };

  const runtime = createOpenAIRuntime({
    apiKey,
    supabase,
    userId: user.id,
    postId: params.id
  });

  const result = await regenerateAndPersist({
    supabase,
    runtime,
    step: stepRaw,
    briefOverride: parsed.data.briefOverride as StrategyBrief | undefined,
    existingCtx: latest.context,
    existingAssetId: params.id,
    userId: user.id,
    workspaceId: latest.workspace_id,
    connectedAccountId: latest.connected_account_id
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    runId: result.runId,
    auditEventCount: result.auditEventCount,
    runSetAgents: result.runSetAgents
  });
}
