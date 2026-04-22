// Line-level unified diff via classic LCS. No dependencies.
//
// Tradeoff: O(m*n) space. For manager-edit blobs (captions are ~280 chars;
// edits rarely exceed a few hundred lines) this is fine. If we ever diff
// long bodies we'll swap in a Myers implementation; for the drawer it's
// overkill.
//
// Output is a flat list of ops in display order, with "removed" and
// "added" blocks interleaved with "unchanged" lines. The drawer renders
// each op as a row with a gutter marker ( -, +, blank ).

export type DiffOp =
  | { kind: "unchanged"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

function splitLines(value: string): string[] {
  // Preserve empty trailing lines deliberately — an edit that adds a blank
  // line at the end should show up in the diff.
  if (value === "") return [];
  return value.split("\n");
}

export function computeLineDiff(before: string, after: string): DiffOp[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const m = beforeLines.length;
  const n = afterLines.length;

  // Fast paths — common cases in manager-edit data.
  if (m === 0 && n === 0) return [];
  if (m === 0) return afterLines.map((text) => ({ kind: "added", text }));
  if (n === 0) return beforeLines.map((text) => ({ kind: "removed", text }));

  // LCS DP table. lcs[i][j] = length of LCS of before[0..i) and after[0..j).
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  // Walk back from (m, n) to (0, 0) producing ops in reverse; then reverse
  // once at the end.
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      ops.push({ kind: "unchanged", text: beforeLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ kind: "added", text: afterLines[j - 1] });
      j -= 1;
    } else {
      ops.push({ kind: "removed", text: beforeLines[i - 1] });
      i -= 1;
    }
  }
  ops.reverse();
  return ops;
}
