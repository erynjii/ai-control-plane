import { describe, expect, it } from "vitest";
import {
  buildGenerationLabel,
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
    // No runId on these events → groupKey falls back to assetId, runId is null.
    expect(group.groupKey).toBe("asset_A");
    expect(group.runId).toBeNull();
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

  it("groups by runId when events carry it, producing one group per run for the same asset", () => {
    // Two runs for asset_X: run_1 (all 5 agents) and run_2 (copy regen).
    const baseMeta = (agent: string, runId: string, summary = "ok") => ({
      agent,
      durationMs: 100,
      model: "gpt-4.1-mini",
      costUsd: 0.01,
      summary,
      runId
    });
    const events: AuditEvent[] = [
      event({
        id: "r2-compl",
        asset_id: "asset_X",
        action: "pipeline.compliance_checked",
        created_at: "2026-04-22T00:10:03.000Z",
        metadata: baseMeta("compliance", "run_2")
      }),
      event({
        id: "r2-brand",
        asset_id: "asset_X",
        action: "pipeline.brand_reviewed",
        created_at: "2026-04-22T00:10:02.000Z",
        metadata: baseMeta("brand", "run_2")
      }),
      event({
        id: "r2-copy",
        asset_id: "asset_X",
        action: "pipeline.copy_drafted",
        created_at: "2026-04-22T00:10:01.000Z",
        metadata: baseMeta("copy", "run_2")
      }),
      event({
        id: "r1-compl",
        asset_id: "asset_X",
        action: "pipeline.compliance_checked",
        created_at: "2026-04-22T00:00:05.000Z",
        metadata: baseMeta("compliance", "run_1")
      }),
      event({
        id: "r1-brand",
        asset_id: "asset_X",
        action: "pipeline.brand_reviewed",
        created_at: "2026-04-22T00:00:04.000Z",
        metadata: baseMeta("brand", "run_1")
      }),
      event({
        id: "r1-photo",
        asset_id: "asset_X",
        action: "pipeline.image_generated",
        created_at: "2026-04-22T00:00:03.000Z",
        metadata: baseMeta("photo", "run_1")
      }),
      event({
        id: "r1-copy",
        asset_id: "asset_X",
        action: "pipeline.copy_drafted",
        created_at: "2026-04-22T00:00:02.000Z",
        metadata: baseMeta("copy", "run_1")
      }),
      event({
        id: "r1-strat",
        asset_id: "asset_X",
        action: "pipeline.strategy_drafted",
        created_at: "2026-04-22T00:00:01.000Z",
        metadata: baseMeta("strategy", "run_1")
      })
    ];

    const view = buildTimelineView(events);
    expect(view.pipelineGroups).toHaveLength(2);

    // Newest run appears first.
    expect(view.pipelineGroups[0].runId).toBe("run_2");
    expect(view.pipelineGroups[0].label).toBe("Regenerated caption");
    expect(view.pipelineGroups[1].runId).toBe("run_1");
    expect(view.pipelineGroups[1].label).toBe("Initial generation");

    // Each group carries its asset id.
    expect(view.pipelineGroups[0].assetId).toBe("asset_X");
    expect(view.pipelineGroups[1].assetId).toBe("asset_X");
  });
});

describe("buildGenerationLabel", () => {
  function mkEvent(agent: string, action: string): PipelineTimelineEventForTest {
    return {
      kind: "pipeline",
      id: `evt_${agent}`,
      assetId: "asset_X",
      action: action as never,
      createdAt: "2026-04-22T00:00:00.000Z",
      payload: {
        agent: agent as never,
        durationMs: 100,
        model: "gpt-4.1-mini",
        costUsd: 0.01,
        summary: "ok"
      }
    };
  }

  it("returns 'Initial generation' when all five core agents are present", () => {
    const events = [
      mkEvent("strategy", "pipeline.strategy_drafted"),
      mkEvent("copy", "pipeline.copy_drafted"),
      mkEvent("photo", "pipeline.image_generated"),
      mkEvent("brand", "pipeline.brand_reviewed"),
      mkEvent("compliance", "pipeline.compliance_checked")
    ];
    expect(buildGenerationLabel(events)).toBe("Initial generation");
  });

  it("returns 'Regenerated caption' when copy ran but photo did not (isolate=true from copy)", () => {
    const events = [
      mkEvent("copy", "pipeline.copy_drafted"),
      mkEvent("brand", "pipeline.brand_reviewed"),
      mkEvent("compliance", "pipeline.compliance_checked")
    ];
    expect(buildGenerationLabel(events)).toBe("Regenerated caption");
  });

  it("returns 'Regenerated image' when photo ran but copy/brand did not (isolate=true from photo)", () => {
    const events = [
      mkEvent("photo", "pipeline.image_generated"),
      mkEvent("compliance", "pipeline.compliance_checked")
    ];
    expect(buildGenerationLabel(events)).toBe("Regenerated image");
  });

  it("returns 'Brief adjusted' when a strategy override event is present", () => {
    const events = [
      mkEvent("strategy", "pipeline.strategy_overridden"),
      mkEvent("copy", "pipeline.copy_drafted"),
      mkEvent("photo", "pipeline.image_generated"),
      mkEvent("brand", "pipeline.brand_reviewed"),
      mkEvent("compliance", "pipeline.compliance_checked")
    ];
    expect(buildGenerationLabel(events)).toBe("Brief adjusted");
  });

  it("falls back to 'Regeneration' for unrecognised combinations", () => {
    const events = [mkEvent("brand", "pipeline.brand_reviewed")];
    expect(buildGenerationLabel(events)).toBe("Regeneration");
  });
});

// Local alias so the label test doesn't have to replicate the export union.
type PipelineTimelineEventForTest = import("./timeline-types").PipelineTimelineEvent;
