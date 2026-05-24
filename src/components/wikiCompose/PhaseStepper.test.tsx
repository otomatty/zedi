/**
 * `PhaseStepper` ユニットテスト (#950)。
 *
 * `phase` プロップが各値のときに、対応するステップ要素が `aria-current="step"`
 * になることを確認する。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseStepper } from "./PhaseStepper";

describe("PhaseStepper", () => {
  it("marks the current phase with aria-current=step", () => {
    render(<PhaseStepper phase="research" />);
    const current = screen.getByTestId("phase-step-research");
    expect(current).toHaveAttribute("aria-current", "step");

    expect(screen.getByTestId("phase-step-brief")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("phase-step-completed")).not.toHaveAttribute("aria-current");
  });

  it("shows the completed phase as the active step", () => {
    render(<PhaseStepper phase="completed" />);
    expect(screen.getByTestId("phase-step-completed")).toHaveAttribute("aria-current", "step");
  });
});
