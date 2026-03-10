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

const mockSummaries = { general: "General summary", ai: "AI summary", storage: "Storage summary" };
vi.mock("@/components/settings/useSettingsSummaries", () => ({
  useSettingsSummaries: () => mockSummaries,
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

  it("renders hub description", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByText("settings.hubDescription")).toBeInTheDocument();
  });

  it("renders SettingsOverview and three sections with forms", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getByRole("navigation", { name: "settings.summary.jumpTo" })).toBeInTheDocument();
    expect(screen.getByTestId("general-form")).toBeInTheDocument();
    expect(screen.getByTestId("ai-form")).toBeInTheDocument();
    expect(screen.getByTestId("storage-form")).toBeInTheDocument();
  });

  it("renders section headings for general, ai, storage", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );

    const generalHeadings = screen.getAllByRole("heading", { name: "settings.general.title" });
    const aiHeadings = screen.getAllByRole("heading", { name: "settings.ai.title" });
    const storageHeadings = screen.getAllByRole("heading", { name: "settings.storage.title" });
    expect(generalHeadings.length).toBeGreaterThanOrEqual(1);
    expect(aiHeadings.length).toBeGreaterThanOrEqual(1);
    expect(storageHeadings.length).toBeGreaterThanOrEqual(1);
  });
});
