import { describe, expect, it, vi } from "vitest";
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
