/**
 * App sidebar: Home / Notes / Settings / Plan nav; active route match; Zedi link to /home; footer when signed in.
 * 左サイドバー: Home/Notes/Settings/Plan ナビ、アクティブは /home 厳密・他は prefix、Zedi リンク /home、フッターはサインイン時のみ。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@zedi/ui";
import { AppSidebar } from "./AppSidebar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "ja" },
  }),
}));

const useAuthFn = vi.hoisted(() => vi.fn(() => ({ isSignedIn: true, isLoaded: true })));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: useAuthFn,
  useUser: vi.fn(() => ({ user: { fullName: "Test User", firstName: "Test", imageUrl: null } })),
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    useAuthFn().isSignedIn ? <>{children}</> : null,
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ displayName: "Test User", avatarUrl: null }),
}));

function renderAppSidebar(initialPath = "/home") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  it("renders nav links for Home, Notes, Settings, Plan with correct paths", () => {
    renderAppSidebar("/home");
    expect(screen.getByRole("link", { name: /nav\.home/ }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: /nav\.notes/ }).getAttribute("href")).toBe("/notes");
    expect(screen.getByRole("link", { name: /nav\.settings/ }).getAttribute("href")).toBe(
      "/settings",
    );
    expect(screen.getByRole("link", { name: /nav\.plan/ }).getAttribute("href")).toBe("/pricing");
  });

  it("renders sidebar header with Zedi link to /home", () => {
    renderAppSidebar("/home");
    const zediLink = screen.getByRole("link", { name: /Zedi/i });
    expect(zediLink).toBeInTheDocument();
    expect(zediLink.getAttribute("href")).toBe("/home");
  });

  it("renders nav.menu as group label", () => {
    renderAppSidebar("/home");
    expect(screen.getByText("Menu")).toBeInTheDocument();
  });

  it("marks Home as active only when pathname is exactly /home", () => {
    renderAppSidebar("/home");
    const homeLink = screen.getByRole("link", { name: /nav\.home/ });
    expect(homeLink).toHaveAttribute("data-active", "true");
  });

  it("marks Home as not active when pathname is /notes", () => {
    renderAppSidebar("/notes");
    const homeLink = screen.getByRole("link", { name: /nav\.home/ });
    expect(homeLink).toHaveAttribute("data-active", "false");
  });

  it("marks Notes as active when pathname starts with /notes", () => {
    renderAppSidebar("/notes/123");
    const notesLink = screen.getByRole("link", { name: /nav\.notes/ });
    expect(notesLink).toHaveAttribute("data-active", "true");
  });

  it("shows sidebar footer when signed in", () => {
    renderAppSidebar("/home");
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("hides sidebar footer when not signed in", () => {
    useAuthFn.mockReturnValue({ isSignedIn: false, isLoaded: true });
    renderAppSidebar("/home");
    expect(screen.queryByText("Test User")).not.toBeInTheDocument();
    useAuthFn.mockReturnValue({ isSignedIn: true, isLoaded: true });
  });
});
