import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalCardPill } from "./approval-card-pill";
import type { AgentFlag } from "@/lib/agents/types";

function flag(overrides: Partial<AgentFlag> = {}): AgentFlag {
  return {
    agent: "brand",
    severity: "warning",
    code: "brand.x",
    message: "Tighten the CTA",
    ...overrides
  };
}

describe("ApprovalCardPill", () => {
  it("v1 fallback: renders the existing RiskBadge (not clickable)", () => {
    render(
      <ApprovalCardPill
        riskLevel="medium"
        maxFlagSeverity={null}
        v1Fallback={true}
      />
    );
    // RiskBadge renders `medium` text, uppercase via CSS.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("v2 clean: shows CLEAN pill when maxFlagSeverity is null and flags is empty", () => {
    render(
      <ApprovalCardPill
        riskLevel="low"
        maxFlagSeverity={null}
        flags={[]}
        v1Fallback={false}
      />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/clean/i);
  });

  it("v2 with flags: shows severity pill with count, expands blockers-first list on click", async () => {
    const flags: AgentFlag[] = [
      flag({ severity: "warning", code: "brand.cta", message: "Tighten CTA" }),
      flag({ severity: "blocker", code: "compliance.medical_claim", message: "Medical claim" }),
      flag({ severity: "note", code: "brand.style", message: "Consider punchier verbs" })
    ];
    render(
      <ApprovalCardPill
        riskLevel="high"
        maxFlagSeverity="blocker"
        flags={flags}
        v1Fallback={false}
      />
    );

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/blocker/i);
    expect(button).toHaveTextContent(/·\s*3/);
    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.setup().click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    // Blockers rendered first.
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/compliance\.medical_claim/);
    expect(items[0]).toHaveTextContent(/Medical claim/);
    expect(items[1]).toHaveTextContent(/brand\.cta/);
    expect(items[2]).toHaveTextContent(/brand\.style/);
  });

  it("collapses on second click", async () => {
    const flags: AgentFlag[] = [flag()];
    render(
      <ApprovalCardPill
        riskLevel="medium"
        maxFlagSeverity="warning"
        flags={flags}
        v1Fallback={false}
      />
    );
    const user = userEvent.setup();
    const button = screen.getByRole("button");
    await user.click(button);
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders a suggestion line when the flag has one", async () => {
    const flags: AgentFlag[] = [
      flag({
        severity: "warning",
        code: "brand.cta",
        message: "CTA is vague",
        suggestion: "Use 'Book your first ritual'"
      })
    ];
    render(
      <ApprovalCardPill
        riskLevel="medium"
        maxFlagSeverity="warning"
        flags={flags}
        v1Fallback={false}
      />
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(screen.getByText(/Use 'Book your first ritual'/)).toBeInTheDocument();
  });
});
