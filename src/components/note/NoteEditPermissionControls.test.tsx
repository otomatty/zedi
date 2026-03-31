/**
 * Edit permission UI: warning banner when any_logged_in is selected.
 * 編集権限 UI: any_logged_in 選択時に警告を出す。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { TooltipProvider } from "@zedi/ui";
import { NoteEditPermissionControls } from "./NoteEditPermissionControls";

vi.mock("react-i18next", () => ({
  useTranslation: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("NoteEditPermissionControls", () => {
  it("does not show risk alert when edit permission is owner_only", () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
      i18n: { language: "en" },
    } as never);
    renderWithProviders(
      <NoteEditPermissionControls
        visibility="public"
        editPermission="owner_only"
        setEditPermission={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows risk alert when edit permission is any_logged_in", () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
      i18n: { language: "en" },
    } as never);
    renderWithProviders(
      <NoteEditPermissionControls
        visibility="public"
        editPermission="any_logged_in"
        setEditPermission={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("notes.editPermissionAnyLoggedInWarningTitle")).toBeInTheDocument();
  });
});
