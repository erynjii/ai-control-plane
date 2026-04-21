import { describe, expect, it } from "vitest";
import { scanContent } from "./index";

describe("scanContent", () => {
  it("returns low risk and no findings for benign content", () => {
    const result = scanContent({
      prompt: "Write a cheerful greeting.",
      output: "Hello there, welcome aboard!"
    });
    expect(result.riskLevel).toBe("low");
    expect(result.findings).toEqual([]);
  });

  it("flags PII email in output as medium risk", () => {
    const result = scanContent({
      prompt: "Send confirmation.",
      output: "Email us at hello@example.com for support."
    });
    expect(result.riskLevel).toBe("medium");
    expect(result.findings.some((f) => f.rule === "pii.email")).toBe(true);
  });
});
