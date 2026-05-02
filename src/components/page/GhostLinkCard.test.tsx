import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { GhostLinkCard } from "./GhostLinkCard";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe("GhostLinkCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("should render the ghost link title", () => {
    renderWithI18n(<GhostLinkCard title="New Page" onClick={() => {}} />);

    expect(screen.getByText("New Page")).toBeInTheDocument();
  });

  it("should show creation prompt", () => {
    renderWithI18n(<GhostLinkCard title="Test" onClick={() => {}} />);

    expect(screen.getByText("クリックしてページを作成")).toBeInTheDocument();
  });

  it("should call onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderWithI18n(<GhostLinkCard title="New Page" onClick={onClick} />);

    await user.click(screen.getByText("New Page"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should have dashed border style", () => {
    renderWithI18n(<GhostLinkCard title="Test" onClick={() => {}} />);

    const card = screen.getByText("Test").closest('[class*="border-dashed"]');
    expect(card).toBeInTheDocument();
  });
});
