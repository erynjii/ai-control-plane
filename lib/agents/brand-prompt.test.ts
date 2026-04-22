import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBrandSystemPrompt, logBrandPrompt } from "./brand-prompt";
import { buildConstraints } from "./constraints";
import type { StrategyBrief } from "./types";
import type { BrandEditHistoryEntry } from "@/lib/types";

const BRIEF: StrategyBrief = {
  audience: "Miami seekers",
  tone: "warm",
  contentPillar: "opening",
  cta: { type: "booking", text: "Book" },
  hashtagClusters: [],
  visualConcept: "spa",
  constraints: buildConstraints("instagram")
};

describe("buildBrandSystemPrompt", () => {
  it("is byte-identical to the base prompt when no edits are supplied", () => {
    const a = buildBrandSystemPrompt(BRIEF);
    const b = buildBrandSystemPrompt(BRIEF, []);
    expect(a).toBe(b);
    // Sanity: base prompt includes the core rubric line.
    expect(a).toContain("Scoring rubric (0–100)");
    expect(a).not.toContain("Recent manager corrections");
  });

  it("appends a feedback section when edits are supplied", () => {
    const edits: BrandEditHistoryEntry[] = [
      { field: "output", before: "We got it.", after: "We've got it." },
      { field: "output", before: "Best product ever.", after: "A new favourite for your routine." }
    ];
    const prompt = buildBrandSystemPrompt(BRIEF, edits);

    expect(prompt).toContain("Recent manager corrections — match this voice.");
    // Each row renders as `N. before → after`.
    expect(prompt).toContain("1. We got it. → We've got it.");
    expect(prompt).toContain("2. Best product ever. → A new favourite for your routine.");
  });

  it("collapses newlines inside before/after so the prompt stays tabular", () => {
    const edits: BrandEditHistoryEntry[] = [
      { field: "output", before: "Line one\nLine two", after: "Single line" }
    ];
    const prompt = buildBrandSystemPrompt(BRIEF, edits);
    expect(prompt).toContain("1. Line one Line two → Single line");
  });
});

describe("logBrandPrompt", () => {
  it("is silent in production when the toggle is off", () => {
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "anything",
      editCount: 3,
      log,
      devOverride: false,
      loggingEnabledOverride: false
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("emits raw prompt content in dev", () => {
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "the full prompt",
      editCount: 2,
      log,
      devOverride: true,
      loggingEnabledOverride: false
    });
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0][0];
    expect(payload.workspaceId).toBe("ws_a");
    expect(payload.editCount).toBe(2);
    expect(payload.promptLength).toBe("the full prompt".length);
    expect(payload.prompt).toBe("the full prompt");
  });

  it("redacts raw prompt in production even when the toggle is on; keeps structured fields", () => {
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "PII: customer name Jane",
      editCount: 4,
      log,
      devOverride: false,
      loggingEnabledOverride: true
    });
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0][0];
    expect(payload.workspaceId).toBe("ws_a");
    expect(payload.editCount).toBe(4);
    expect(payload.promptLength).toBeGreaterThan(0);
    expect(payload.promptRedactedInProduction).toBe(true);
    // No raw prompt content leaks through.
    expect(payload.prompt).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Jane");
  });

  it("reports editSectionChars = 0 when no feedback section is in the prompt", () => {
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "Prompt with no edit section.",
      editCount: 0,
      log,
      devOverride: true,
      loggingEnabledOverride: false
    });
    expect(log.mock.calls[0][0].editSectionChars).toBe(0);
  });

  it("reports editSectionChars > 0 when the edit section marker is present", () => {
    const prompt =
      "Base prompt content\n\nRecent manager corrections — match this voice.\n1. foo → bar";
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt,
      editCount: 1,
      log,
      devOverride: true,
      loggingEnabledOverride: false
    });
    const payload = log.mock.calls[0][0];
    expect(payload.editSectionChars).toBeGreaterThan(0);
    expect(payload.editSectionChars).toBeLessThan(prompt.length);
  });
});

// These tests deliberately do NOT use the devOverride / loggingEnabledOverride
// injection seams. They exercise the real process.env.NODE_ENV and
// process.env.LOG_BRAND_PROMPTS read paths, guarding against a regression
// where someone changes which env var is consulted or inverts a guard and
// the override-based tests still pass.
describe("logBrandPrompt — real env reads", () => {
  // @types/node narrows NODE_ENV so a direct assignment fails TS. Go
  // through a mutable view of process.env; same runtime behavior.
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalToggle = env.LOG_BRAND_PROMPTS;

  function setEnv(key: string, value: string | undefined) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  afterEach(() => {
    setEnv("NODE_ENV", originalNodeEnv);
    setEnv("LOG_BRAND_PROMPTS", originalToggle);
  });

  it("silent when NODE_ENV=production and LOG_BRAND_PROMPTS is unset", () => {
    setEnv("NODE_ENV", "production");
    setEnv("LOG_BRAND_PROMPTS", undefined);
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "contains PII: Jane Doe",
      editCount: 3,
      log
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("silent when NODE_ENV=production and LOG_BRAND_PROMPTS=false", () => {
    setEnv("NODE_ENV", "production");
    setEnv("LOG_BRAND_PROMPTS", "false");
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "contains PII: Jane Doe",
      editCount: 3,
      log
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("redacts raw prompt when NODE_ENV=production and LOG_BRAND_PROMPTS=true", () => {
    // THIS is the "flag accidentally shipped enabled" scenario. Must not
    // leak the raw prompt even though the logger fires.
    setEnv("NODE_ENV", "production");
    setEnv("LOG_BRAND_PROMPTS", "true");
    const log = vi.fn();
    const prompt = "System prompt containing PII: customer Jane Doe, SSN 999-99-9999";
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt,
      editCount: 3,
      log
    });
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0][0];
    expect(payload.prompt).toBeUndefined();
    expect(payload.promptRedactedInProduction).toBe(true);
    // Structured fields still surface for debuggability.
    expect(payload.workspaceId).toBe("ws_a");
    expect(payload.editCount).toBe(3);
    expect(payload.promptLength).toBe(prompt.length);
    // No byte of the raw prompt leaks through the serialized payload.
    expect(JSON.stringify(payload)).not.toContain("Jane Doe");
    expect(JSON.stringify(payload)).not.toContain("999-99-9999");
  });

  it("accepts the common truthy shapes for LOG_BRAND_PROMPTS in prod (still redacts)", () => {
    setEnv("NODE_ENV", "production");
    for (const raw of ["true", "1", "yes"]) {
      setEnv("LOG_BRAND_PROMPTS", raw);
      const log = vi.fn();
      logBrandPrompt({
        workspaceId: "ws_a",
        prompt: "PII: Jane",
        editCount: 1,
        log
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0].prompt).toBeUndefined();
      expect(log.mock.calls[0][0].promptRedactedInProduction).toBe(true);
    }
  });

  it("emits raw prompt in development (NODE_ENV=development, toggle off)", () => {
    // Dev gets the raw prompt by default — that's the intended behavior
    // (easy debugging on a laptop). Cemented as a contract so a
    // well-meaning "always redact" refactor doesn't ship silently.
    setEnv("NODE_ENV", "development");
    setEnv("LOG_BRAND_PROMPTS", undefined);
    const log = vi.fn();
    const prompt = "the full prompt in dev";
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt,
      editCount: 2,
      log
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0].prompt).toBe(prompt);
  });

  it("treats test env as non-prod (raw prompt emitted when the logger fires)", () => {
    setEnv("NODE_ENV", "test");
    setEnv("LOG_BRAND_PROMPTS", undefined);
    const log = vi.fn();
    logBrandPrompt({
      workspaceId: "ws_a",
      prompt: "the full prompt in test",
      editCount: 1,
      log
    });
    expect(log.mock.calls[0][0].prompt).toBe("the full prompt in test");
  });
});
