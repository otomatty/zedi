import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MermaidGeneratorNotConfiguredView } from "./MermaidGeneratorNotConfiguredView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

describe("MermaidGeneratorNotConfiguredView", () => {
  it("renders title and description", () => {
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={vi.fn()}
        onGoToSettings={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "editor.commands.mermaid.notConfigured.title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("editor.commands.mermaid.notConfigured.description"),
    ).toBeInTheDocument();
    expect(screen.getByText("editor.commands.mermaid.notConfigured.hint")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={onOpenChange}
        onGoToSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onGoToSettings when goToSettings is clicked", async () => {
    const user = userEvent.setup();
    const onGoToSettings = vi.fn();
    render(
      <MermaidGeneratorNotConfiguredView
        open={true}
        onOpenChange={vi.fn()}
        onGoToSettings={onGoToSettings}
      />,
    );

    await user.click(screen.getByRole("button", { name: "common.goToSettings" }));

    expect(onGoToSettings).toHaveBeenCalledTimes(1);
  });
});
