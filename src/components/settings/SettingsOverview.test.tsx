import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsOverview } from "./SettingsOverview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

function renderWithRouter(initialEntries: string[] = ["/settings"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/settings" element={<SettingsOverview />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SettingsOverview", () => {
  it("renders navigation with three section links", () => {
    renderWithRouter();
    const nav = screen.getByRole("navigation", { name: "settings.summary.jumpTo" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /settings\.general\.title/ })).toHaveAttribute(
      "href",
      "/settings?section=general",
    );
    expect(screen.getByRole("link", { name: /settings\.ai\.title/ })).toHaveAttribute(
      "href",
      "/settings?section=ai",
    );
    expect(screen.getByRole("link", { name: /settings\.storage\.title/ })).toHaveAttribute(
      "href",
      "/settings?section=storage",
    );
  });

  it("includes returnTo in link when present in search params", () => {
    renderWithRouter(["/settings?returnTo=/home"]);
    const generalLink = screen.getByRole("link", { name: /settings\.general\.title/ });
    expect(generalLink.getAttribute("href")).toContain("returnTo=%2Fhome");
    expect(generalLink.getAttribute("href")).toContain("section=general");
  });
});
