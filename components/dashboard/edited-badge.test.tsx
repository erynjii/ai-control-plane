import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("without onClick renders as a plain span (non-interactive)", () => {
    render(<EditedBadge count={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("with onClick renders as a button and invokes the handler on click", () => {
    const onClick = vi.fn();
    render(<EditedBadge count={2} onClick={onClick} />);
    const button = screen.getByRole("button", { name: /view diff/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
