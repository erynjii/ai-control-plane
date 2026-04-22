import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalCardBrief } from "./approval-card-brief";
import type { StrategyBrief } from "@/lib/agents/types";

function sampleBrief(overrides: Partial<StrategyBrief> = {}): StrategyBrief {
  return {
    audience: "Miami wellness seekers aged 28–45",
    tone: "warm, grounded",
    contentPillar: "Grand opening",
    cta: { type: "booking", text: "Book your first ritual" },
    hashtagClusters: ["#HeadSpa", "#MiamiWellness"],
    visualConcept: "Softly lit spa interior",
    optimalPostTime: "Thu 7–9pm local",
    constraints: {
      bannedWords: [],
      requiredDisclaimers: [],
      platformLimits: { maxChars: 2200, maxHashtags: 30 }
    },
    ...overrides
  };
}

describe("ApprovalCardBrief", () => {
  it("renders nothing when brief is missing (v1 card path)", () => {
    const { container } = render(<ApprovalCardBrief brief={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the compact summary row with audience/tone/cta", () => {
    render(<ApprovalCardBrief brief={sampleBrief()} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/Audience:/i);
    expect(button).toHaveTextContent(/Tone:/i);
    expect(button).toHaveTextContent(/CTA:/i);
    expect(button).toHaveTextContent(/Miami wellness seekers/i);
  });

  it("expands the full brief on click and collapses on second click", async () => {
    render(<ApprovalCardBrief brief={sampleBrief()} />);
    const user = userEvent.setup();
    const button = screen.getByRole("button");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Visual concept (not in the compact summary) appears only when expanded.
    expect(screen.getByText(/Softly lit spa interior/i)).toBeInTheDocument();
    expect(screen.getByText(/Grand opening/i)).toBeInTheDocument();
    expect(screen.getByText(/#HeadSpa/i)).toBeInTheDocument();
    expect(screen.getByText(/Thu 7–9pm/i)).toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Softly lit spa interior/i)).not.toBeInTheDocument();
  });

  it("hides hashtag + time rows when the brief has none", async () => {
    render(
      <ApprovalCardBrief
        brief={sampleBrief({ hashtagClusters: [], optimalPostTime: undefined })}
      />
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(screen.queryByText(/Hashtags/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best time/i)).not.toBeInTheDocument();
  });
});
