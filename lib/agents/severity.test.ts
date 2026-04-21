import { describe, expect, it } from "vitest";
import { resolveMaxFlagSeverity } from "./severity";
import type { AgentFlag } from "./types";

function flag(severity: AgentFlag["severity"]): AgentFlag {
  return { agent: "brand", severity, code: "x", message: "y" };
}

describe("resolveMaxFlagSeverity", () => {
  it("returns null for an empty array", () => {
    expect(resolveMaxFlagSeverity([])).toBeNull();
  });

  it("returns 'note' when only notes are present", () => {
    expect(resolveMaxFlagSeverity([flag("note"), flag("note")])).toBe("note");
  });

  it("promotes to 'warning' when a warning exists alongside notes", () => {
    expect(resolveMaxFlagSeverity([flag("note"), flag("warning")])).toBe("warning");
  });

  it("promotes to 'blocker' when a blocker exists, even with warnings", () => {
    expect(resolveMaxFlagSeverity([flag("warning"), flag("blocker"), flag("note")])).toBe("blocker");
  });
});
