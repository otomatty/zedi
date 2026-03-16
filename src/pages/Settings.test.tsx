import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "./Settings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/components/settings/GeneralSettingsForm", () => ({
  GeneralSettingsForm: () => <div data-testid="general-form">GeneralSettingsForm</div>,
}));
vi.mock("@/components/settings/AISettingsForm", () => ({
  AISettingsForm: () => <div data-testid="ai-form">AISettingsForm</div>,
}));
vi.mock("@/components/settings/StorageSettingsForm", () => ({
  StorageSettingsForm: () => <div data-testid="storage-form">StorageSettingsForm</div>,
}));

describe("Settings", () => {
  it("renders header with title and back link", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "settings.title" })).toBeInTheDocument();
    const backLink = screen.getByRole("link", { name: "common.back" });
    expect(backLink).toHaveAttribute("href", "/home");
  });

  it("renders header nav and default general form", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "settings.summary.jumpTo" })).toBeInTheDocument();
    expect(screen.getByTestId("general-form")).toBeInTheDocument();
  });

  it("renders default general as current and shows general section heading", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    const generalButton = screen.getByRole("button", { name: /settings\.general\.title/ });
    expect(generalButton).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "settings.general.title" })).toBeInTheDocument();
  });

  it("renders ai section when section=ai in URL", () => {
    render(
      <MemoryRouter initialEntries={["/settings?section=ai"]}>
        <Settings />
      </MemoryRouter>,
    );

    const aiButton = screen.getByRole("button", { name: /settings\.ai\.title/ });
    expect(aiButton).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "settings.ai.title" })).toBeInTheDocument();
  });
});
