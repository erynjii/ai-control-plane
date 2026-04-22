import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartialRegenerateMenu } from "./partial-regenerate-menu";
import type { StrategyBrief } from "@/lib/agents/types";

function brief(overrides: Partial<StrategyBrief> = {}): StrategyBrief {
  return {
    audience: "Miami seekers",
    tone: "warm",
    contentPillar: "Opening",
    cta: { type: "booking", text: "Book" },
    hashtagClusters: [],
    visualConcept: "spa interior",
    constraints: {
      bannedWords: [],
      requiredDisclaimers: [],
      platformLimits: { maxChars: 2200, maxHashtags: 30 }
    },
    ...overrides
  };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

function mockOkResponse(runId: string, runSetAgents: string[]): Response {
  return new Response(
    JSON.stringify({ ok: true, runId, runSetAgents, auditEventCount: runSetAgents.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("PartialRegenerateMenu", () => {
  it("opens kebab menu and lists three actions", async () => {
    render(<PartialRegenerateMenu assetId="asset_1" brief={brief()} />);
    const kebab = screen.getByRole("button", { name: /more regenerate options/i });
    await userEvent.setup().click(kebab);

    expect(screen.getByRole("menuitem", { name: /regenerate caption/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /regenerate image/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /adjust strategy/i })).toBeInTheDocument();
  });

  it("regenerate caption: POSTs step=copy (no body override), fires onRegenerated on success", async () => {
    fetchSpy.mockResolvedValueOnce(mockOkResponse("run_2", ["copy", "brand", "compliance"]));
    const onRegenerated = vi.fn();

    render(<PartialRegenerateMenu assetId="asset_1" brief={brief()} onRegenerated={onRegenerated} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /more regenerate options/i }));
    await user.click(screen.getByRole("menuitem", { name: /regenerate caption/i }));

    await waitFor(() => expect(onRegenerated).toHaveBeenCalledTimes(1));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/assets/asset_1/regenerate?step=copy");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({});

    expect(onRegenerated).toHaveBeenCalledWith({
      runId: "run_2",
      runSetAgents: ["copy", "brand", "compliance"]
    });
  });

  it("regenerate image: POSTs step=photo", async () => {
    fetchSpy.mockResolvedValueOnce(mockOkResponse("run_2", ["photo", "compliance"]));
    render(<PartialRegenerateMenu assetId="asset_1" brief={brief()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /more regenerate options/i }));
    await user.click(screen.getByRole("menuitem", { name: /regenerate image/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/assets/asset_1/regenerate?step=photo");
  });

  it("adjust strategy: opens modal pre-filled with current brief, edits + submit → POSTs step=strategy with briefOverride", async () => {
    fetchSpy.mockResolvedValueOnce(mockOkResponse("run_2", ["copy", "photo", "brand", "compliance"]));
    const onRegenerated = vi.fn();

    render(
      <PartialRegenerateMenu
        assetId="asset_1"
        brief={brief({ audience: "Original audience" })}
        onRegenerated={onRegenerated}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /more regenerate options/i }));
    await user.click(screen.getByRole("menuitem", { name: /adjust strategy/i }));

    const dialog = screen.getByRole("dialog", { name: /adjust strategy/i });
    expect(dialog).toBeInTheDocument();

    // Modal pre-fills with the current brief.
    const audienceInput = screen.getByLabelText(/audience/i) as HTMLInputElement;
    expect(audienceInput.value).toBe("Original audience");

    await user.clear(audienceInput);
    await user.type(audienceInput, "New audience");

    await user.click(screen.getByRole("button", { name: /^regenerate$/i }));

    await waitFor(() => expect(onRegenerated).toHaveBeenCalledTimes(1));

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/assets/asset_1/regenerate?step=strategy");
    const body = JSON.parse((init as RequestInit).body as string) as {
      briefOverride: StrategyBrief;
    };
    expect(body.briefOverride.audience).toBe("New audience");
    expect(body.briefOverride.tone).toBe("warm"); // untouched field still carried over
  });

  it("surfaces an error message when the POST fails", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "cost cap exceeded" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    );
    render(<PartialRegenerateMenu assetId="asset_1" brief={brief()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /more regenerate options/i }));
    await user.click(screen.getByRole("menuitem", { name: /regenerate caption/i }));

    await waitFor(() => expect(screen.getByText(/cost cap exceeded/i)).toBeInTheDocument());
  });

  it("disables the Adjust Strategy menu item when brief is missing (v1 card)", async () => {
    render(<PartialRegenerateMenu assetId="asset_1" brief={undefined} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /more regenerate options/i }));
    const adjust = screen.getByRole("menuitem", { name: /adjust strategy/i });
    expect(adjust).toBeDisabled();
  });
});
