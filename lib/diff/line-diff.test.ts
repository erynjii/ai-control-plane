import { describe, expect, it } from "vitest";
import { computeLineDiff } from "./line-diff";

describe("computeLineDiff", () => {
  it("returns [] when both sides are empty", () => {
    expect(computeLineDiff("", "")).toEqual([]);
  });

  it("emits only 'added' when before is empty", () => {
    const ops = computeLineDiff("", "hello\nworld");
    expect(ops).toEqual([
      { kind: "added", text: "hello" },
      { kind: "added", text: "world" }
    ]);
  });

  it("emits only 'removed' when after is empty", () => {
    const ops = computeLineDiff("hello\nworld", "");
    expect(ops).toEqual([
      { kind: "removed", text: "hello" },
      { kind: "removed", text: "world" }
    ]);
  });

  it("marks identical lines as unchanged", () => {
    const ops = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(ops.every((o) => o.kind === "unchanged")).toBe(true);
    expect(ops.map((o) => o.text)).toEqual(["a", "b", "c"]);
  });

  it("detects a pure replacement in the middle as remove+add", () => {
    const ops = computeLineDiff("a\nb\nc", "a\nB\nc");
    expect(ops).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "unchanged", text: "c" }
    ]);
  });

  it("detects an added line without disturbing unchanged context", () => {
    const ops = computeLineDiff("a\nc", "a\nb\nc");
    expect(ops).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "added", text: "b" },
      { kind: "unchanged", text: "c" }
    ]);
  });

  it("detects a removed line", () => {
    const ops = computeLineDiff("a\nb\nc", "a\nc");
    expect(ops).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "unchanged", text: "c" }
    ]);
  });

  it("handles transposition (swap) as remove+add pairs", () => {
    const ops = computeLineDiff("a\nb", "b\na");
    // Either ordering is LCS-valid (LCS length = 1). The key invariant is
    // that exactly one line survives as unchanged and the rest is
    // remove/add.
    const unchanged = ops.filter((o) => o.kind === "unchanged");
    const removed = ops.filter((o) => o.kind === "removed");
    const added = ops.filter((o) => o.kind === "added");
    expect(unchanged).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
  });

  it("preserves blank lines as distinct ops", () => {
    const ops = computeLineDiff("a\n\nb", "a\nb");
    expect(ops).toEqual([
      { kind: "unchanged", text: "a" },
      { kind: "removed", text: "" },
      { kind: "unchanged", text: "b" }
    ]);
  });

  it("diffs the caption-level edits the drawer will see", () => {
    const before = "We got it. Visit us!\n#spa";
    const after = "We've got it. Visit us!\n#spa #miami";
    const ops = computeLineDiff(before, after);
    expect(ops).toContainEqual({ kind: "removed", text: "We got it. Visit us!" });
    expect(ops).toContainEqual({ kind: "added", text: "We've got it. Visit us!" });
    expect(ops).toContainEqual({ kind: "removed", text: "#spa" });
    expect(ops).toContainEqual({ kind: "added", text: "#spa #miami" });
  });
});
