// Component tests for InsightsCard — PR 4 adds the window selector and the
// server-side trend deltas. We stub window.fetch so the component can
// exercise its real useEffect flow without a live route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InsightsCard } from "./insights-card";

type StatsPayload = {
  window: string;
  totalAssets: number;
  promotedTotal: number;
  byStatus: {
    draft: number;
    pending_review: number;
    approved: number;
    rejected: number;
    queued: number;
    published: number;
    failed: number;
  };
  byRisk: { low: number; medium: number; high: number; unknown: number };
  publishedTotal: number;
  failedTotal: number;
  byDestination: Record<string, number>;
  approvedCount: number;
  editedApprovedCount: number;
  editRate: number | null;
  timeToApproveSeconds: number | null;
  costPerApprovedUsd: number | null;
  previousPeriod: StatsPayload | null;
};

function emptyStats(overrides: Partial<StatsPayload> = {}): StatsPayload {
  return {
    window: "this_month",
    totalAssets: 0,
    promotedTotal: 0,
    byStatus: {
      draft: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
      queued: 0,
      published: 0,
      failed: 0
    },
    byRisk: { low: 0, medium: 0, high: 0, unknown: 0 },
    publishedTotal: 0,
    failedTotal: 0,
    byDestination: {},
    approvedCount: 0,
    editedApprovedCount: 0,
    editRate: null,
    timeToApproveSeconds: null,
    costPerApprovedUsd: null,
    previousPeriod: null,
    ...overrides
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(payload: StatsPayload) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => payload
  });
}

describe("InsightsCard (PR 4)", () => {
  it("defaults to 'This month' on mount and sends ?window=this_month&compareTo=previous", async () => {
    respondWith(emptyStats());
    render(<InsightsCard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("window=this_month");
    expect(url).toContain("compareTo=previous");
    expect(screen.getByRole("button", { name: /select time window/i })).toHaveTextContent(
      "This month"
    );
  });

  it("refetches when the user picks a different window", async () => {
    respondWith(emptyStats({ window: "this_month" }));
    render(<InsightsCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    respondWith(emptyStats({ window: "7d" }));
    fireEvent.click(screen.getByRole("button", { name: /select time window/i }));
    // Menu opens; click "7 days"
    fireEvent.click(screen.getByRole("option", { name: "7 days" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain("window=7d");
  });

  it("renders server-side trend deltas when previousPeriod is populated (rolling window)", async () => {
    respondWith(
      emptyStats({
        window: "7d",
        totalAssets: 120,
        previousPeriod: emptyStats({ totalAssets: 100 })
      })
    );
    render(<InsightsCard />);

    // Wait for data
    await waitFor(() => expect(screen.getByText("120")).toBeInTheDocument());
    // 20 / 100 = 20%
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("hides trend arrows when previousPeriod is null (this_month)", async () => {
    respondWith(
      emptyStats({
        window: "this_month",
        totalAssets: 120,
        previousPeriod: null
      })
    );
    render(<InsightsCard />);

    await waitFor(() => expect(screen.getByText("120")).toBeInTheDocument());
    // No trend percentages should render since previousPeriod is null.
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("renders 'Failed to load.' on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "oops" })
    });
    render(<InsightsCard />);
    await waitFor(() => expect(screen.getByText("Failed to load.")).toBeInTheDocument());
  });

  it("re-fetches when refreshKey changes", async () => {
    respondWith(emptyStats());
    const { rerender } = render(<InsightsCard refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    respondWith(emptyStats());
    await act(async () => {
      rerender(<InsightsCard refreshKey={1} />);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("renders all seven tile labels", async () => {
    respondWith(emptyStats());
    render(<InsightsCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    for (const label of [
      "Total created",
      "Approval rate",
      "Published",
      "Failed",
      "Edit rate",
      "Time to approve",
      "Cost / approved"
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders em-dash for null metrics (no approved posts)", async () => {
    respondWith(
      emptyStats({
        editRate: null,
        timeToApproveSeconds: null,
        costPerApprovedUsd: null
      })
    );
    render(<InsightsCard />);
    await waitFor(() => expect(screen.getByText("Edit rate")).toBeInTheDocument());

    // Edit rate / Time to approve / Cost per approved tiles all show "—".
    // Total created / Published / Failed render "0". Approval rate also "—"
    // because approved+rejected = 0. So we expect at least 4 em-dashes.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("formats PR 4 metrics: edit rate as %, time-to-approve as duration, cost as $", async () => {
    respondWith(
      emptyStats({
        editRate: 0.3333,
        timeToApproveSeconds: 185, // 3m 5s
        costPerApprovedUsd: 0.12
      })
    );
    render(<InsightsCard />);

    await waitFor(() => expect(screen.getByText("33%")).toBeInTheDocument());
    expect(screen.getByText("3m 5s")).toBeInTheDocument();
    expect(screen.getByText("$0.12")).toBeInTheDocument();
  });
});
