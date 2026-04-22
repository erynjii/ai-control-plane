// Smoke test for the React Testing Library setup. Asserts the v2
// "Generation" header renders + collapses against a real ActivityTimeline.
//
// Intentionally minimal — proves the test env (jsdom, jest-dom matchers,
// fetch stubbing, userEvent) works end-to-end. PR 3 will add comprehensive
// component coverage when it touches the approval card.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityTimeline } from "./activity-timeline";

// Five pipeline events for one v2 asset (oldest → newest stored newest-first
// to match the API's return order) plus two lifecycle events for an
// unrelated asset, so both render paths are exercised.
const SAMPLE_EVENTS = [
  // Lifecycle (asset_B)
  {
    id: "evt_l2",
    asset_id: "asset_B",
    action: "publish_succeeded",
    metadata: { destination: "instagram" },
    created_at: "2026-04-22T00:10:00.000Z"
  },
  {
    id: "evt_l1",
    asset_id: "asset_B",
    action: "queued",
    metadata: { destination: "instagram" },
    created_at: "2026-04-22T00:09:00.000Z"
  },
  // Pipeline (asset_A) — newest first
  {
    id: "evt_p5",
    asset_id: "asset_A",
    action: "pipeline.compliance_checked",
    metadata: {
      agent: "compliance",
      durationMs: 800,
      model: "gpt-4.1-mini",
      costUsd: 0.02,
      summary: "clean"
    },
    created_at: "2026-04-22T00:00:05.000Z"
  },
  {
    id: "evt_p4",
    asset_id: "asset_A",
    action: "pipeline.brand_reviewed",
    metadata: {
      agent: "brand",
      durationMs: 600,
      model: "gpt-4.1-mini",
      costUsd: 0.03,
      summary: "top score: 88, no flags"
    },
    created_at: "2026-04-22T00:00:04.000Z"
  },
  {
    id: "evt_p3",
    asset_id: "asset_A",
    action: "pipeline.image_generated",
    metadata: {
      agent: "photo",
      durationMs: 2100,
      model: "gpt-image-1",
      costUsd: 0.04,
      summary: "image generated"
    },
    created_at: "2026-04-22T00:00:03.000Z"
  },
  {
    id: "evt_p2",
    asset_id: "asset_A",
    action: "pipeline.copy_drafted",
    metadata: {
      agent: "copy",
      durationMs: 1200,
      model: "gpt-4.1-mini",
      costUsd: 0.1,
      summary: "2 variants"
    },
    created_at: "2026-04-22T00:00:02.000Z"
  },
  {
    id: "evt_p1",
    asset_id: "asset_A",
    action: "pipeline.strategy_drafted",
    metadata: {
      agent: "strategy",
      durationMs: 900,
      model: "gpt-4.1-mini",
      costUsd: 0.05,
      summary: "tone='warm', pillar='Grand opening'"
    },
    created_at: "2026-04-22T00:00:01.000Z"
  }
];

beforeEach(() => {
  // Stub the audit-events fetch ActivityTimeline calls on mount.
  // Anything else (e.g. pipeline-runs from the drawer) gets a 404 so we
  // notice if a future change starts firing extra requests on render.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.startsWith("/api/audit-events")) {
        return new Response(JSON.stringify({ events: SAMPLE_EVENTS }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "not stubbed" }), { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ActivityTimeline (smoke)", () => {
  it("renders the Generation header and collapses on click", async () => {
    render(<ActivityTimeline />);

    // Header appears once the audit-events fetch resolves.
    const header = await screen.findByRole("button", { name: /generation/i });
    expect(header).toBeInTheDocument();

    // Cost rollup should show summed pipeline cost ($0.05 + 0.10 + 0.04 + 0.03 + 0.02 = $0.24).
    const headerScope = within(header);
    expect(headerScope.getByText(/\$0\.24/)).toBeInTheDocument();

    // All 5 agent labels are visible while expanded.
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
    expect(header).toHaveAttribute("aria-expanded", "true");

    // Clicking the header collapses the group.
    const user = userEvent.setup();
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Strategy")).not.toBeInTheDocument();
    expect(screen.queryByText("Compliance")).not.toBeInTheDocument();

    // Lifecycle list still renders independently.
    expect(screen.getByText(/Published to Instagram/i)).toBeInTheDocument();

    // Re-click expands it again.
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Strategy")).toBeInTheDocument();
  });
});
