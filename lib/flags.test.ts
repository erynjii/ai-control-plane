import { describe, expect, it } from "vitest";
import { isPipelineV2Enabled, parseWorkspaceAllowlist } from "./flags";

describe("parseWorkspaceAllowlist", () => {
  it("returns an empty set when the env var is undefined", () => {
    expect(parseWorkspaceAllowlist(undefined).size).toBe(0);
  });

  it("returns an empty set when the env var is empty", () => {
    expect(parseWorkspaceAllowlist("").size).toBe(0);
  });

  it("trims whitespace and drops empty entries", () => {
    const set = parseWorkspaceAllowlist(" ws_alpha , ws_beta ,,, ws_gamma ");
    expect(Array.from(set).sort()).toEqual(["ws_alpha", "ws_beta", "ws_gamma"]);
  });

  it("is case-sensitive", () => {
    const set = parseWorkspaceAllowlist("ws_Alpha");
    expect(set.has("ws_Alpha")).toBe(true);
    expect(set.has("ws_alpha")).toBe(false);
  });
});

describe("isPipelineV2Enabled", () => {
  it("is false when the workspace id is empty", () => {
    expect(isPipelineV2Enabled("", "ws_alpha")).toBe(false);
  });

  it("is false when the workspace is not listed", () => {
    expect(isPipelineV2Enabled("ws_other", "ws_alpha,ws_beta")).toBe(false);
  });

  it("is true when the workspace is listed exactly", () => {
    expect(isPipelineV2Enabled("ws_beta", "ws_alpha, ws_beta , ws_gamma")).toBe(true);
  });

  it("is false when the env var is undefined", () => {
    expect(isPipelineV2Enabled("ws_alpha", undefined)).toBe(false);
  });
});
