import { describe, expect, it } from "vitest";
import { buildEditInsert } from "./edits";

describe("buildEditInsert", () => {
  it("builds a row when before and after differ", () => {
    const row = buildEditInsert({
      assetId: "asset_1",
      userId: "user_1",
      field: "output",
      before: "First draft caption.",
      after: "Revised caption with a clearer CTA."
    });
    expect(row).toEqual({
      asset_id: "asset_1",
      user_id: "user_1",
      field: "output",
      before: "First draft caption.",
      after: "Revised caption with a clearer CTA."
    });
  });

  it("returns null when before and after are byte-identical (no-op)", () => {
    const row = buildEditInsert({
      assetId: "asset_1",
      userId: "user_1",
      field: "output",
      before: "Same caption.",
      after: "Same caption."
    });
    expect(row).toBeNull();
  });

  it("treats whitespace-only changes as real edits", () => {
    const row = buildEditInsert({
      assetId: "asset_1",
      userId: "user_1",
      field: "output",
      before: "Caption.",
      after: "Caption. "
    });
    expect(row).not.toBeNull();
  });
});
