/**
 * NoteSettings レイアウトのテスト。
 *
 * 共通ヘッダー（タイトル + サブタイトル + 「ノートへ戻る」リンク）とサイドナビ +
 * `<Outlet />` 構成を確認する。各セクションは独自テストでカバーするので、
 * ここではモックして「クリックでサブルートに遷移する」「ロールでサイドナビ
 * 項目数が変わる」「未ログイン / canView=false で no-access」だけを検証する。
 *
 * Smoke-tests the settings layout shell: header, sidebar item visibility per
 * role, navigation, loading / no-access placeholders. Section bodies are
 * mocked to keep this suite focused on the layout contract.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import NoteSettings from "./index";
import { useNote } from "@/hooks/useNoteQueries";
import type { Note, NoteAccess, NoteAccessRole } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNote: vi.fn(),
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

vi.mock("@/components/layout/PageLoadingOrDenied", () => ({
  PageLoadingOrDenied: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-loading-or-denied">{children}</div>
  ),
}));

vi.mock("@/components/note/NoteTitleSwitcher", () => ({
  NoteTitleSwitcher: ({ noteTitle }: { noteTitle: string }) => (
    <span data-testid="note-title-switcher">{noteTitle}</span>
  ),
}));

vi.mock("@/components/note/NoteVisibilityBadge", () => ({
  NoteVisibilityBadge: ({ visibility }: { visibility: string }) => (
    <span data-testid="note-visibility-badge">{visibility}</span>
  ),
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Test note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: false,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

const ownerAccess: NoteAccess = {
  role: "owner",
  visibility: "private",
  editPermission: "owner_only",
  canView: true,
  canEdit: true,
  canAddPage: true,
  canManageMembers: true,
  canDeletePage: () => true,
};

function buildAccess(role: NoteAccessRole): NoteAccess {
  if (role === "owner") return ownerAccess;
  return {
    role,
    visibility: "private",
    editPermission: "owner_only",
    canView: true,
    canEdit: role === "editor",
    canAddPage: role === "editor",
    canManageMembers: false,
    canDeletePage: () => false,
  };
}

function GeneralStub() {
  return <div data-testid="section-general">General</div>;
}
function VisibilityStub() {
  return <div data-testid="section-visibility">Visibility</div>;
}
function MembersStub() {
  return <div data-testid="section-members">Members</div>;
}
function LinksStub() {
  return <div data-testid="section-links">Links</div>;
}
function DomainsStub() {
  return <div data-testid="section-domains">Domains</div>;
}
function DangerStub() {
  return <div data-testid="section-danger">Danger</div>;
}

function renderSettings(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/notes/:noteId/settings" element={<NoteSettings />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralStub />} />
          <Route path="visibility" element={<VisibilityStub />} />
          <Route path="members" element={<MembersStub />} />
          <Route path="links" element={<LinksStub />} />
          <Route path="domains" element={<DomainsStub />} />
          <Route path="danger" element={<DangerStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteSettings layout", () => {
  beforeEach(() => {
    vi.mocked(useNote).mockReturnValue({
      note: baseNote,
      access: ownerAccess,
      source: "local",
      isLoading: false,
    } as never);
  });

  it("shows loading placeholder while the note is loading", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: true,
    } as never);
    renderSettings("/notes/note-1/settings/general");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("shows no-access placeholder when the note is missing", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    renderSettings("/notes/note-1/settings/general");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("shows no-access placeholder when access.canView is false", () => {
    vi.mocked(useNote).mockReturnValue({
      note: baseNote,
      access: { ...ownerAccess, canView: false },
      source: "local",
      isLoading: false,
    } as never);
    renderSettings("/notes/note-1/settings/general");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("renders the General section by default for owners", () => {
    renderSettings("/notes/note-1/settings/general");
    expect(screen.getByTestId("section-general")).toBeInTheDocument();
    // Owner sees every nav entry (general, visibility, members, links, domains, danger).
    // オーナーはサイドナビの全 6 項目を見られる。
    expect(screen.getByRole("link", { name: /settingsNav\.general/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settingsNav\.danger/i })).toBeInTheDocument();
  });

  it("navigates to the Members section when the sidebar link is clicked", () => {
    renderSettings("/notes/note-1/settings/general");
    fireEvent.click(screen.getByRole("link", { name: /settingsNav\.members/i }));
    expect(screen.getByTestId("section-members")).toBeInTheDocument();
  });

  it("hides owner-only sidebar entries for editors (no general, no danger)", () => {
    vi.mocked(useNote).mockReturnValue({
      note: baseNote,
      access: buildAccess("editor"),
      source: "local",
      isLoading: false,
    } as never);
    renderSettings("/notes/note-1/settings/visibility");
    expect(screen.queryByRole("link", { name: /settingsNav\.general/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settingsNav\.danger/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settingsNav\.visibility/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settingsNav\.members/i })).toBeInTheDocument();
  });

  it("shows only the Visibility entry for viewers", () => {
    vi.mocked(useNote).mockReturnValue({
      note: baseNote,
      access: buildAccess("viewer"),
      source: "local",
      isLoading: false,
    } as never);
    renderSettings("/notes/note-1/settings/visibility");
    expect(screen.getByRole("link", { name: /settingsNav\.visibility/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settingsNav\.members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settingsNav\.danger/i })).not.toBeInTheDocument();
  });
});
