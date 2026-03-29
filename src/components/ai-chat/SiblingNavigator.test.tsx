import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiblingNavigator } from "./SiblingNavigator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_k: string, fallback: string) => fallback,
  }),
}));

describe("SiblingNavigator", () => {
  it("renders nothing when total is 1", () => {
    const { container } = render(
      <SiblingNavigator currentIndex={0} total={1} onSwitch={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows index indicator when total > 1", () => {
    render(<SiblingNavigator currentIndex={0} total={2} onSwitch={vi.fn()} />);
    expect(screen.getByTestId("sibling-navigator")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("calls onSwitch with prev when previous button is clicked", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<SiblingNavigator currentIndex={1} total={3} onSwitch={onSwitch} />);
    const prev = screen.getByRole("button", { name: /Previous branch/i });
    await user.click(prev);
    expect(onSwitch).toHaveBeenCalledWith("prev");
  });

  it("calls onSwitch with next when next button is clicked", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<SiblingNavigator currentIndex={1} total={3} onSwitch={onSwitch} />);
    const next = screen.getByRole("button", { name: /Next branch/i });
    await user.click(next);
    expect(onSwitch).toHaveBeenCalledWith("next");
  });
});
