import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditedBadge } from "./edited-badge";

describe("EditedBadge", () => {
  it("renders nothing when count is 0 or negative", () => {
    const { container, rerender } = render(<EditedBadge count={0} />);
    expect(container.firstChild).toBeNull();
    rerender(<EditedBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'edited' (singular) when count is 1", () => {
    render(<EditedBadge count={1} />);
    const pill = screen.getByText(/^edited$/);
    expect(pill).toBeInTheDocument();
    // Tooltip carries the count too.
    expect(pill.closest("span")).toHaveAttribute("title", expect.stringMatching(/1 edit\b/));
  });

  it("renders 'edited ×N' when count > 1", () => {
    render(<EditedBadge count={3} />);
    expect(screen.getByText(/edited ×3/)).toBeInTheDocument();
  });
});
