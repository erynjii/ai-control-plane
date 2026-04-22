#!/usr/bin/env node
/**
 * scripts/v2-smoke.ts
 *
 * End-to-end smoke for the v2 agent pipeline, run against a local dev
 * server. Produces PASS/FAIL per check and exits 0 / 1.
 *
 * ---------------------------------------------------------------
 * How to run
 * ---------------------------------------------------------------
 *
 * 1. Apply migrations 0001–0010 to your local Supabase project.
 * 2. Populate .env.local with (at minimum):
 *
 *      NEXT_PUBLIC_SUPABASE_URL=...
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *      SUPABASE_SERVICE_ROLE_KEY=...       # for pipeline_runs read-back
 *      OPENAI_API_KEY=...                  # real key, pipeline calls live API
 *      PIPELINE_V2_WORKSPACES=ws_smoke     # must include the v2 workspace below
 *      SUPABASE_TEST_ACCESS_TOKEN=eyJhbGc… # a logged-in user's JWT
 *
 * 3. Start the dev server in another terminal:
 *
 *      npm run dev
 *
 * 4. Run:
 *
 *      npx tsx scripts/v2-smoke.ts <v2_workspace_id> [v1_workspace_id]
 *
 *    v2_workspace_id  — must be in PIPELINE_V2_WORKSPACES
 *    v1_workspace_id  — optional, must NOT be in PIPELINE_V2_WORKSPACES.
 *                       Defaults to "default-workspace".
 *
 *    Example:
 *      npx tsx scripts/v2-smoke.ts ws_smoke
 *
 * ---------------------------------------------------------------
 * Auth caveat
 * ---------------------------------------------------------------
 * /api/generate-post authenticates via the Supabase SSR cookie set by
 * @supabase/ssr (see lib/supabase/server.ts). This script sends the token
 * as `Authorization: Bearer <SUPABASE_TEST_ACCESS_TOKEN>`. If your server
 * client hasn't been extended to accept bearer fallbacks, the POST will
 * return 401.
 *
 * Two easy fixes if that happens:
 *   (a) Temporarily extend createSupabaseServerClient to read the
 *       Authorization header when the cookie is absent, OR
 *   (b) Set SUPABASE_TEST_COOKIE in .env.local to a full Cookie header
 *       value copied from a logged-in browser session; the script will
 *       forward it verbatim when set.
 *
 * ---------------------------------------------------------------
 * Checks
 * ---------------------------------------------------------------
 * A  V2 happy path            — 5 ok stepLog entries, cost 0.05–0.25,
 *                                brief+variants populated, max_severity
 *                                in {null, note, warning}
 * B  Compliance stress test   — >=2 compliance flags with severity
 *                                blocker|warning on a medical-claims prompt
 * C  V1 regression            — zero pipeline_runs rows for an asset
 *                                created in a non-v2 workspace
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ----- env loading --------------------------------------------------------

function loadDotenv(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return; // .env.local not present — rely on shell env.
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv(join(process.cwd(), ".env.local"));

// ----- args + config ------------------------------------------------------

const V2_WORKSPACE = process.argv[2];
const V1_WORKSPACE = process.argv[3] ?? "default-workspace";
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ACCESS_TOKEN = process.env.SUPABASE_TEST_ACCESS_TOKEN ?? "";
const COOKIE = process.env.SUPABASE_TEST_COOKIE ?? ""; // optional fallback

const ALLOWLIST = (process.env.PIPELINE_V2_WORKSPACES ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

if (!V2_WORKSPACE) {
  die("Usage: npx tsx scripts/v2-smoke.ts <v2_workspace_id> [v1_workspace_id]");
}
if (!SUPABASE_URL) die("NEXT_PUBLIC_SUPABASE_URL is not set (check .env.local).");
if (!SERVICE_KEY) die("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!ACCESS_TOKEN && !COOKIE) {
  die("Neither SUPABASE_TEST_ACCESS_TOKEN nor SUPABASE_TEST_COOKIE is set — the POST will 401.");
}
if (!ALLOWLIST.includes(V2_WORKSPACE)) {
  die(
    `Workspace "${V2_WORKSPACE}" is not in PIPELINE_V2_WORKSPACES (currently: ${
      ALLOWLIST.join(", ") || "<empty>"
    }). Add it and restart the dev server.`
  );
}
if (ALLOWLIST.includes(V1_WORKSPACE)) {
  die(
    `Workspace "${V1_WORKSPACE}" IS in PIPELINE_V2_WORKSPACES — Check C needs a workspace NOT on the v2 allowlist.`
  );
}

// ----- supabase (service role, bypasses RLS for pipeline_runs reads) -----

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ----- prompts ------------------------------------------------------------

const PRIMARY_PROMPT =
  "Grand opening post for Aurora Bonita, our new Miami head spa, opening Saturday May 9. We offer Japanese-style scalp treatments, 60-90 minute sessions starting at $120. Opening week: 20% off first visit when booked online at aurorabonita.com. Tone should feel luxurious but welcoming — not clinical or intimidating. Audience is women 28-45 in Miami who invest in self-care.";

const VARIANT_B_PROMPT =
  "Post about our head spa treatments — great for stress relief, migraines, and sleep problems. Clinically proven to reduce cortisol and boost serotonin. Natural alternative to medication.";

const V1_PROMPT = "Quick welcome post — new week, new energy.";

// ----- request helpers ----------------------------------------------------

interface GeneratePostResponse {
  output?: string;
  imagePrompt?: string;
  imageUrl?: string;
  asset?: { id: string; output?: string };
  conversationId?: string;
  error?: string;
}

async function postGeneratePost(
  workspaceId: string,
  prompt: string
): Promise<{ ok: boolean; status: number; body: GeneratePostResponse }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (ACCESS_TOKEN) headers.Authorization = `Bearer ${ACCESS_TOKEN}`;
  if (COOKIE) headers.Cookie = COOKIE;

  const response = await fetch(`${BASE_URL}/api/generate-post`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      modelMode: "Auto",
      workspaceId
    })
  });
  const body = (await response.json().catch(() => ({}))) as GeneratePostResponse;
  return { ok: response.ok, status: response.status, body };
}

// ----- read-back ---------------------------------------------------------

interface StepLogEntry {
  agent: string;
  status: string;
}

interface FlagEntry {
  agent: string;
  severity: string;
  code: string;
  message: string;
}

interface PipelineRunRow {
  id: string;
  asset_id: string;
  total_cost_usd: number | string;
  duration_ms: number;
  max_flag_severity: string | null;
  context: {
    brief?: unknown;
    variants?: Array<{ id: string; text: string }>;
    flags: FlagEntry[];
    stepLog: StepLogEntry[];
  };
}

async function fetchRun(assetId: string): Promise<PipelineRunRow | null> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("id, asset_id, total_cost_usd, duration_ms, max_flag_severity, context")
    .eq("asset_id", assetId)
    .maybeSingle();
  if (error) {
    die(`Failed to fetch pipeline_runs for ${assetId}: ${error.message}`);
  }
  return (data as PipelineRunRow | null) ?? null;
}

async function countRuns(assetId: string): Promise<number> {
  const { count, error } = await supabase
    .from("pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", assetId);
  if (error) {
    die(`Failed to count pipeline_runs for ${assetId}: ${error.message}`);
  }
  return count ?? 0;
}

// ----- reporters ----------------------------------------------------------

function pass(label: string, detail: string): boolean {
  console.log(`PASS  ${label} — ${detail}`);
  return true;
}

function fail(label: string, detail: string): boolean {
  console.log(`FAIL  ${label} — ${detail}`);
  return false;
}

// ----- checks -------------------------------------------------------------

async function checkA(): Promise<boolean> {
  const label = "Check A  V2 happy path";
  const { ok, status, body } = await postGeneratePost(V2_WORKSPACE, PRIMARY_PROMPT);
  if (!ok || !body.asset?.id) {
    return fail(label, `POST ${status}: ${body.error ?? "no asset in response"}`);
  }
  const assetId = body.asset.id;
  const run = await fetchRun(assetId);
  if (!run) return fail(label, `no pipeline_runs row for asset ${assetId}`);

  const stepLog = run.context.stepLog ?? [];
  const stepCount = stepLog.length;
  const allOk = stepCount === 5 && stepLog.every((entry) => entry.status === "ok");
  const cost = Number(run.total_cost_usd);
  const costOk = cost >= 0.05 && cost <= 0.25;
  const briefOk = Boolean(run.context.brief);
  const variantsCount = Array.isArray(run.context.variants) ? run.context.variants.length : 0;
  const variantsOk = variantsCount >= 2;
  const severity = run.max_flag_severity;
  const severityOk = severity === null || severity === "note" || severity === "warning";

  const detail =
    `steps=${stepCount} (${stepLog.map((s) => `${s.agent}:${s.status}`).join(", ")})` +
    `, cost=$${cost.toFixed(4)}` +
    `, brief=${briefOk ? "ok" : "missing"}` +
    `, variants=${variantsCount}` +
    `, max_severity=${severity ?? "null"}`;

  return allOk && costOk && briefOk && variantsOk && severityOk
    ? pass(label, detail)
    : fail(label, detail);
}

async function checkB(): Promise<boolean> {
  const label = "Check B  Compliance stress test";
  const { ok, status, body } = await postGeneratePost(V2_WORKSPACE, VARIANT_B_PROMPT);
  if (!ok || !body.asset?.id) {
    return fail(label, `POST ${status}: ${body.error ?? "no asset in response"}`);
  }
  const run = await fetchRun(body.asset.id);
  if (!run) return fail(label, `no pipeline_runs row for asset ${body.asset.id}`);

  const complianceFlags = (run.context.flags ?? []).filter(
    (flag) =>
      flag.agent === "compliance" &&
      (flag.severity === "blocker" || flag.severity === "warning")
  );

  const severities = complianceFlags.map((f) => f.severity).join(", ") || "none";
  const codes = complianceFlags.map((f) => f.code).join(", ") || "—";
  const detail = `compliance blocker/warning flags=${complianceFlags.length} [severities: ${severities}] [codes: ${codes}]`;

  return complianceFlags.length >= 2 ? pass(label, detail) : fail(label, detail);
}

async function checkC(): Promise<boolean> {
  const label = "Check C  V1 regression";
  const { ok, status, body } = await postGeneratePost(V1_WORKSPACE, V1_PROMPT);
  if (!ok || !body.asset?.id) {
    return fail(label, `POST ${status}: ${body.error ?? "no asset in response"}`);
  }
  const rows = await countRuns(body.asset.id);
  const detail = `workspace=${V1_WORKSPACE}, pipeline_runs rows for v1 asset=${rows}`;
  return rows === 0 ? pass(label, detail) : fail(label, detail);
}

// ----- main --------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`v2-smoke → ${BASE_URL}`);
  console.log(`  v2 workspace: ${V2_WORKSPACE}`);
  console.log(`  v1 workspace: ${V1_WORKSPACE}`);
  console.log(`  auth: ${ACCESS_TOKEN ? "bearer" : "cookie"}`);
  console.log("");

  const results: boolean[] = [];
  try {
    results.push(await checkA());
    results.push(await checkB());
    results.push(await checkC());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nUnhandled error: ${message}`);
    process.exit(1);
  }

  console.log("");
  const allPassed = results.every(Boolean);
  console.log(allPassed ? "All checks PASS." : "One or more checks FAILED.");
  process.exit(allPassed ? 0 : 1);
}

void main();
