// Component tests for EditDiffViewer — the PR 4 drawer that renders a
// unified before→after diff for each manager edit on an asset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditDiffViewer } from "./edit-diff-viewer";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondOk(payload: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
}

describe("EditDiffViewer", () => {
  it("renders nothing when assetId is null (closed state)", () => {
    const onClose = vi.fn();
    const { container } = render(<EditDiffViewer assetId={null} onClose={onClose} />);
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/assets/<id>/edits?include=full on open", async () => {
    respondOk({ count: 0, latest: null, edits: [] });
    const onClose = vi.fn();
    render(<EditDiffViewer assetId="asset_A" onClose={onClose} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("/api/assets/asset_A/edits?include=full");
  });

  it("shows the empty state when an asset has no edits", async () => {
    respondOk({ count: 0, latest: null, edits: [] });
    render(<EditDiffViewer assetId="asset_A" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByText(/This asset has no manager edits — nothing to show\./)
      ).toBeInTheDocument()
    );
  });

  it("renders a unified diff for the newest edit by default", async () => {
    respondOk({
      count: 2,
      latest: { field: "output", editedAt: "2026-04-22T00:02:00.000Z" },
      edits: [
        {
          id: "edit_2",
          field: "output",
          before: "We got it.\n#spa",
          after: "We've got it.\n#spa #miami",
          editedAt: "2026-04-22T00:02:00.000Z"
        },
        {
          id: "edit_1",
          field: "output",
          before: "Older before",
          after: "Older after",
          editedAt: "2026-04-22T00:01:00.000Z"
        }
      ]
    });
    render(<EditDiffViewer assetId="asset_A" onClose={vi.fn()} />);

    // The newest edit's removed/added lines are rendered.
    await waitFor(() => expect(screen.getByText("We got it.")).toBeInTheDocument());
    expect(screen.getByText("We've got it.")).toBeInTheDocument();
    expect(screen.getByText("#spa")).toBeInTheDocument();
    expect(screen.getByText("#spa #miami")).toBeInTheDocument();
    // Older edit's content should NOT be on screen by default.
    expect(screen.queryByText("Older before")).toBeNull();
  });

  it("lets the user switch to an older edit from the nav", async () => {
    respondOk({
      count: 2,
      latest: { field: "output", editedAt: "2026-04-22T00:02:00.000Z" },
      edits: [
        {
          id: "edit_2",
          field: "output",
          before: "new before",
          after: "new after",
          editedAt: "2026-04-22T00:02:00.000Z"
        },
        {
          id: "edit_1",
          field: "output",
          before: "Older before text",
          after: "Older after text",
          editedAt: "2026-04-22T00:01:00.000Z"
        }
      ]
    });
    render(<EditDiffViewer assetId="asset_A" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("new before")).toBeInTheDocument());

    // The nav shows #2 (newest) and #1. Click #1.
    const oldButton = screen.getByRole("button", { name: /^#1 · / });
    fireEvent.click(oldButton);

    await waitFor(() => expect(screen.getByText("Older before text")).toBeInTheDocument());
    expect(screen.getByText("Older after text")).toBeInTheDocument();
    expect(screen.queryByText("new before")).toBeNull();
  });

  it("invokes onClose when the close button is clicked", async () => {
    respondOk({ count: 0, latest: null, edits: [] });
    const onClose = vi.fn();
    render(<EditDiffViewer assetId="asset_A" onClose={onClose} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose on Escape key", async () => {
    respondOk({ count: 0, latest: null, edits: [] });
    const onClose = vi.fn();
    render(<EditDiffViewer assetId="asset_A" onClose={onClose} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders 'Failed to load edits.' on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "boom" }) });
    render(<EditDiffViewer assetId="asset_A" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Failed to load edits.")).toBeInTheDocument());
  });
});
