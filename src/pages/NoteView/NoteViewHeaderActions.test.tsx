/**
 * NoteViewHeaderActions のロール別表示テスト (#675)。
 * Tests for the role-based visibility of the share entry point in the note
 * view header (#675 follow-up to the share modal V1).
 *
 * 観点 / Coverage:
 *   - Owner: ドロップダウン（共有 + 設定）が表示される
 *   - Editor / Viewer (signed-in, canView): 共有ボタンのみが表示される
 *   - Guest (canView だが未ログイン): 「ログインすると投稿できます」ヒント
 *   - canView=false: 何もレンダリングしない
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import type { Note } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(",")})`
        : key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock("@/hooks/useNoteQueries", () => ({
  useNoteMembers: vi.fn(() => ({ data: [], isLoading: false })),
}));

// 共有モーダルは別テストでカバー済み。ここは「呼ばれたか」だけ気にする。
// The share modal has its own test suite — stub it here to keep this file
// focused on the entry-point UI.
vi.mock("./ShareModal/NoteShareModal", () => ({
  NoteShareModal: ({ open, userRole }: { open: boolean; userRole?: string }) =>
    open ? (
      <div data-testid="note-share-modal" data-user-role={userRole ?? "owner"}>
        ShareModal
      </div>
    ) : null,
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Test note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

function renderActions(props: Partial<React.ComponentProps<typeof NoteViewHeaderActions>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const merged = {
    note: baseNote,
    canManageMembers: true,
    isSignedIn: true,
    canView: true,
    userRole: "owner" as const,
    ...props,
  };
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NoteViewHeaderActions {...merged} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NoteViewHeaderActions — role-based visibility (#675)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("owner は MoreHorizontal ドロップダウンを表示（共有 + 設定リンクへの導線）", () => {
    renderActions({ canManageMembers: true, userRole: "owner" });
    expect(screen.getByRole("button", { name: "notes.openActions" })).toBeInTheDocument();
    // 共有ボタン単体は出さない（ドロップダウン経由でアクセス）
    expect(screen.queryByRole("button", { name: "notes.shareAria" })).not.toBeInTheDocument();
  });

  it("editor は単独の共有ボタンを表示しドロップダウンは出さない", () => {
    renderActions({ canManageMembers: false, userRole: "editor" });
    expect(screen.getByRole("button", { name: "notes.shareAria" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "notes.openActions" })).not.toBeInTheDocument();
  });

  it("viewer は単独の共有ボタンを表示する（公開設定を read-only で見せるため）", () => {
    renderActions({ canManageMembers: false, userRole: "viewer" });
    expect(screen.getByRole("button", { name: "notes.shareAria" })).toBeInTheDocument();
  });

  it("未ログイン (canView=true, isSignedIn=false) はログインヒントを表示する", () => {
    renderActions({
      canManageMembers: false,
      isSignedIn: false,
      canView: true,
      userRole: "guest",
    });
    expect(screen.getByText("notes.loginToPost")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "notes.shareAria" })).not.toBeInTheDocument();
  });

  it("canView=false の場合は何もレンダリングしない", () => {
    const { container } = renderActions({
      canManageMembers: false,
      canView: false,
      userRole: "none",
    });
    expect(container).toBeEmptyDOMElement();
  });
});
