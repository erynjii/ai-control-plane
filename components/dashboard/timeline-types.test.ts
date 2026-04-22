import { describe, expect, it } from "vitest";
import {
  buildTimelineView,
  classifyAuditEvent,
  isLifecycleAction,
  parsePipelineMetadata
} from "./timeline-types";
import type { AuditEvent } from "@/lib/types";

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id: "evt_1",
    asset_id: "asset_1",
    action: "queued",
    metadata: {},
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides
  };
}

describe("isLifecycleAction", () => {
  it("accepts the known publish-flow actions", () => {
    expect(isLifecycleAction("queued")).toBe(true);
    expect(isLifecycleAction("publish_succeeded")).toBe(true);
    expect(isLifecycleAction("retry_triggered")).toBe(true);
  });

  it("rejects pipeline actions and unknown strings", () => {
    expect(isLifecycleAction("pipeline.strategy_drafted")).toBe(false);
    expect(isLifecycleAction("nonsense")).toBe(false);
  });
});

describe("parsePipelineMetadata", () => {
  const GOOD = {
    agent: "strategy",
    durationMs: 1234,
    model: "gpt-4.1-mini",
    costUsd: 0.05,
    summary: "tone='warm'"
  };

  it("accepts a well-formed payload", () => {
    expect(parsePipelineMetadata(GOOD)).toEqual(GOOD);
  });

  it("rejects null / non-object input", () => {
    expect(parsePipelineMetadata(null)).toBeNull();
    expect(parsePipelineMetadata(undefined)).toBeNull();
    expect(parsePipelineMetadata("string")).toBeNull();
    expect(parsePipelineMetadata(42)).toBeNull();
  });

  it("rejects unknown agents", () => {
    expect(parsePipelineMetadata({ ...GOOD, agent: "wizard" })).toBeNull();
  });

  it("rejects non-finite durationMs/costUsd", () => {
    expect(parsePipelineMetadata({ ...GOOD, durationMs: NaN })).toBeNull();
    expect(parsePipelineMetadata({ ...GOOD, costUsd: Infinity })).toBeNull();
  });

  it("rejects missing or wrong-type fields", () => {
    const { model: _model, ...noModel } = GOOD;
    void _model;
    expect(parsePipelineMetadata(noModel)).toBeNull();
    expect(parsePipelineMetadata({ ...GOOD, summary: 123 })).toBeNull();
  });
});

describe("classifyAuditEvent", () => {
  it("classifies a well-formed pipeline event", () => {
    const classified = classifyAuditEvent(
      event({
        action: "pipeline.strategy_drafted",
        metadata: {
          agent: "strategy",
          durationMs: 1000,
          model: "gpt-4.1-mini",
          costUsd: 0.05,
          summary: "tone='warm'"
        }
      })
    );
    expect(classified.kind).toBe("pipeline");
  });

  it("degrades malformed pipeline metadata to a lifecycle entry (rather than crashing)", () => {
    const classified = classifyAuditEvent(
      event({
        action: "pipeline.strategy_drafted",
        metadata: { agent: "wizard" }
      })
    );
    expect(classified.kind).toBe("lifecycle");
  });

  it("classifies known lifecycle actions as lifecycle", () => {
    const classified = classifyAuditEvent(event({ action: "publish_succeeded" }));
    expect(classified.kind).toBe("lifecycle");
  });
});

describe("buildTimelineView", () => {
  it("groups pipeline events by asset_id, sums cost, preserves oldest-first order within a group", () => {
    const events: AuditEvent[] = [
      // Mix of assets and timestamps; API returns newest-first.
      event({
        id: "e5",
        asset_id: "asset_A",
        action: "pipeline.compliance_checked",
        created_at: "2026-04-22T00:00:04.000Z",
        metadata: {
          agent: "compliance",
          durationMs: 500,
          model: "gpt-4.1-mini",
          costUsd: 0.02,
          summary: "clean"
        }
      }),
      event({
        id: "e4",
        asset_id: "asset_A",
        action: "pipeline.brand_reviewed",
        created_at: "2026-04-22T00:00:03.000Z",
        metadata: {
          agent: "brand",
          durationMs: 400,
          model: "gpt-4.1-mini",
          costUsd: 0.03,
          summary: "top score: 88"
        }
      }),
      event({
        id: "e3",
        asset_id: "asset_A",
        action: "pipeline.strategy_drafted",
        created_at: "2026-04-22T00:00:01.000Z",
        metadata: {
          agent: "strategy",
          durationMs: 1000,
          model: "gpt-4.1-mini",
          costUsd: 0.05,
          summary: "tone='warm'"
        }
      }),
      event({
        id: "e2",
        asset_id: "asset_B",
        action: "publish_succeeded",
        created_at: "2026-04-22T00:01:00.000Z"
      }),
      event({
        id: "e1",
        asset_id: "asset_C",
        action: "queued",
        created_at: "2026-04-22T00:02:00.000Z"
      })
    ];

    const view = buildTimelineView(events);

    expect(view.pipelineGroups).toHaveLength(1);
    const group = view.pipelineGroups[0];
    expect(group.assetId).toBe("asset_A");
    expect(group.events.map((e) => e.action)).toEqual([
      "pipeline.strategy_drafted",
      "pipeline.brand_reviewed",
      "pipeline.compliance_checked"
    ]);
    expect(group.totalCostUsd).toBeCloseTo(0.1, 6);
    expect(view.lifecycle.map((e) => e.action)).toEqual(["publish_succeeded", "queued"]);
  });

  it("returns empty groups + all lifecycle when no pipeline events are present (matches v1 render)", () => {
    const events: AuditEvent[] = [
      event({ action: "queued", created_at: "2026-04-22T00:00:00.000Z" }),
      event({ action: "publish_started", created_at: "2026-04-22T00:00:01.000Z" })
    ];
    const view = buildTimelineView(events);
    expect(view.pipelineGroups).toEqual([]);
    expect(view.lifecycle).toHaveLength(2);
  });

  it("returns an empty view when given an empty input", () => {
    const view = buildTimelineView([]);
    expect(view.pipelineGroups).toEqual([]);
    expect(view.lifecycle).toEqual([]);
  });
});
