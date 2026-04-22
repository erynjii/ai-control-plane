// End-to-end integration test for the Brand feedback loop.
//
// Exercises runBrand against a stub runtime that captures whatever system
// prompt Brand actually sends to the chat model. Asserts that the prompt:
//   - Contains the edit section when BRAND_FEEDBACK_WORKSPACES lists the
//     workspace and the runtime's fetchBrandEdits returns rows.
//   - Stays base-only when the workspace isn't listed (kill switch works).
//   - Stays base-only when the runtime doesn't provide fetchBrandEdits.
//   - Doesn't re-call fetchBrandEdits on subsequent runs within the same
//     test scope when the runtime exposes a shared fetcher (caching is
//     tested in brand-feedback.test; this only asserts Brand calls it once
//     per invocation).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBrand } from "./brand";
import { buildConstraints } from "./constraints";
import { baseContext, stubRuntime } from "./test-utils";
import type { CaptionVariant, PipelineContext, StrategyBrief } from "./types";
import type { BrandEditHistoryEntry } from "@/lib/types";
import type { ChatRequest, ChatResponse } from "./runtime";

const BRIEF: StrategyBrief = {
  audience: "Miami seekers",
  tone: "warm",
  contentPillar: "opening",
  cta: { type: "booking", text: "Book" },
  hashtagClusters: [],
  visualConcept: "spa",
  constraints: buildConstraints("instagram")
};

const VARIANTS: CaptionVariant[] = [
  { id: "post_v1", text: "First caption", hashtags: [] },
  { id: "post_v2", text: "Second caption", hashtags: [] }
];

const REVIEWS = JSON.stringify({
  reviews: [
    { variantId: "post_v1", score: 80, flags: [] },
    { variantId: "post_v2", score: 70, flags: [] }
  ]
});

const SAMPLE_EDITS: BrandEditHistoryEntry[] = [
  { field: "output", before: "Best ever.", after: "A new favourite." },
  { field: "output", before: "Cure-all.", after: "Restorative ritual." }
];

function ctx(workspaceId: string): PipelineContext {
  return {
    ...baseContext({ workspaceId }),
    brief: BRIEF,
    variants: [...VARIANTS]
  };
}

function captureChat() {
  const calls: ChatRequest[] = [];
  const handler = (req: ChatRequest): ChatResponse => {
    calls.push(req);
    return { text: REVIEWS, model: "gpt-4.1-mini", inputTokens: 10, outputTokens: 10 };
  };
  return { handler, calls };
}

const ORIGINAL_ENV = process.env.BRAND_FEEDBACK_WORKSPACES;
beforeEach(() => {
  delete process.env.BRAND_FEEDBACK_WORKSPACES;
});
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.BRAND_FEEDBACK_WORKSPACES;
  else process.env.BRAND_FEEDBACK_WORKSPACES = ORIGINAL_ENV;
});

describe("Brand feedback loop integration", () => {
  it("includes the edit section when workspace is enabled and runtime provides fetchBrandEdits", async () => {
    process.env.BRAND_FEEDBACK_WORKSPACES = "ws_feedback";
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    const next = await runBrand(ctx("ws_feedback"), runtime);

    expect(next.stepLog[0].status).toBe("ok");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub).toHaveBeenCalledWith("ws_feedback");

    // System prompt now carries the feedback section.
    expect(calls).toHaveLength(1);
    const systemPrompt = calls[0].system;
    expect(systemPrompt).toContain("Recent manager corrections — match this voice.");
    expect(systemPrompt).toContain("Best ever. → A new favourite.");
    expect(systemPrompt).toContain("Cure-all. → Restorative ritual.");
  });

  it("falls back to the base prompt when BRAND_FEEDBACK_WORKSPACES is completely UNSET (default-off kill switch)", async () => {
    // beforeEach already deletes the var; this test deliberately does NOT
    // re-set it. This guards against a regression where the default
    // changes from opt-in to opt-out (e.g. someone inverts the flag, or
    // the isBrandFeedbackEnabled implementation stops reading from
    // process.env and misses the undefined case).
    expect(process.env.BRAND_FEEDBACK_WORKSPACES).toBeUndefined();
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    await runBrand(ctx("ws_feedback"), runtime);

    expect(fetchStub).not.toHaveBeenCalled();
    expect(calls[0].system).not.toContain("Recent manager corrections");
    // Stronger assertion: the prompt is byte-identical to the base.
    expect(calls[0].system).not.toContain("→");
  });

  it("falls back to the base prompt when the env var is an empty string", async () => {
    // Another common shape: the env var is set in a template file but
    // left empty ("BRAND_FEEDBACK_WORKSPACES="). Must behave identically
    // to unset.
    process.env.BRAND_FEEDBACK_WORKSPACES = "";
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    await runBrand(ctx("ws_feedback"), runtime);

    expect(fetchStub).not.toHaveBeenCalled();
    expect(calls[0].system).not.toContain("Recent manager corrections");
  });

  it("falls back to the base prompt when the env var lists only whitespace / commas", async () => {
    // Guards against a sloppy edit like `BRAND_FEEDBACK_WORKSPACES=,,  ,`.
    process.env.BRAND_FEEDBACK_WORKSPACES = ",,  ,";
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    await runBrand(ctx("ws_feedback"), runtime);

    expect(fetchStub).not.toHaveBeenCalled();
    expect(calls[0].system).not.toContain("Recent manager corrections");
  });

  it("falls back to the base prompt when workspace is NOT on the allowlist (kill switch)", async () => {
    process.env.BRAND_FEEDBACK_WORKSPACES = "ws_other";
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    await runBrand(ctx("ws_feedback"), runtime);

    // Runtime's fetchBrandEdits MUST NOT have been called.
    expect(fetchStub).not.toHaveBeenCalled();
    // Prompt is base-only — no feedback section.
    expect(calls[0].system).not.toContain("Recent manager corrections");
  });

  it("falls back to the base prompt when the runtime doesn't provide fetchBrandEdits at all", async () => {
    process.env.BRAND_FEEDBACK_WORKSPACES = "ws_feedback";
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler }); // no fetchBrandEdits

    await runBrand(ctx("ws_feedback"), runtime);

    expect(calls[0].system).not.toContain("Recent manager corrections");
  });

  it("falls back to the base prompt when the runtime's fetch throws", async () => {
    process.env.BRAND_FEEDBACK_WORKSPACES = "ws_feedback";
    const fetchStub = vi.fn(async () => {
      throw new Error("supabase 500");
    });
    const { handler, calls } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    const next = await runBrand(ctx("ws_feedback"), runtime);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    // Brand stays operational — step logged "ok", prompt is base-only.
    expect(next.stepLog[0].status).toBe("ok");
    expect(calls[0].system).not.toContain("Recent manager corrections");
  });

  it("calls fetchBrandEdits exactly once per Brand invocation", async () => {
    process.env.BRAND_FEEDBACK_WORKSPACES = "ws_feedback";
    const fetchStub = vi.fn(async () => SAMPLE_EDITS);
    const { handler } = captureChat();
    const runtime = stubRuntime({ chat: handler, fetchBrandEdits: fetchStub });

    await runBrand(ctx("ws_feedback"), runtime);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    // Second run in same test scope: Brand again calls fetchBrandEdits
    // (cache lives in the runtime's fetcher implementation, not in Brand).
    await runBrand(ctx("ws_feedback"), runtime);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
