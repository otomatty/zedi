/**
 * NoteViewHeaderActions のロール別表示テスト (#675)。
 * Tests for the role-based visibility of the share entry point in the note
 * view header (#675 follow-up to the share modal V1).
 *
 * 観点 / Coverage:
 *   - Owner: ドロップダウン（共有 + 設定）が表示される
 *   - Editor / Viewer (signed-in, canView): 共有ボタンのみが表示される
 *   - Guest: 未ログインならヒント、サインイン済み public/unlisted guest は共有導線なし
 *   - canView=false: 何もレンダリングしない
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteViewHeaderActions } from "./NoteViewHeaderActions";
import type { Note, NoteAccessRole } from "@/types/note";

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
// `userRole` のフォールバックはコンポーネント本体の最小権限既定値 (`"none"`) と
// 揃え、呼び出し側で渡し漏れがあった場合に回帰として顕在化させる (#794 review)。
//
// The share modal has its own test suite — stub it here to keep this file
// focused on the entry-point UI. The fallback for `userRole` mirrors the
// component's least-privilege default (`"none"`) so a missing-prop regression
// surfaces in tests instead of being silently promoted to owner UI.
vi.mock("./ShareModal/NoteShareModal", () => ({
  NoteShareModal: ({ open, userRole }: { open: boolean; userRole?: NoteAccessRole }) =>
    open ? (
      <div data-testid="note-share-modal" data-user-role={userRole ?? "none"}>
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
  // 既定値は最小権限の `"none"`。各テストはエレベートしたロールを明示的に渡す。
  // Default to least-privilege `"none"`; tests opt into elevated roles
  // explicitly so a missing override surfaces as an obvious test failure
  // instead of silently rendering owner UI.
  const merged = {
    note: baseNote,
    canManageMembers: true,
    isSignedIn: true,
    canView: true,
    userRole: "none" as const,
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

  it("editor の共有ボタン押下で userRole がモーダルへ伝播する", () => {
    // クリック経路で `userRole` が NoteShareModal に渡り続けていることを担保。
    // ロールマトリックス全体を支える接続点なので、回帰検知用に明示的に確認する。
    // Click-path regression guard: ensures the editor's role keeps flowing into
    // NoteShareModal so the read-only matrix is not silently bypassed.
    renderActions({ canManageMembers: false, userRole: "editor" });
    fireEvent.click(screen.getByRole("button", { name: "notes.shareAria" }));
    expect(screen.getByTestId("note-share-modal")).toHaveAttribute("data-user-role", "editor");
  });

  it("サインイン済み guest は共有ボタンを表示しない", () => {
    const { container } = renderActions({
      canManageMembers: false,
      isSignedIn: true,
      canView: true,
      userRole: "guest",
    });
    expect(screen.queryByRole("button", { name: "notes.shareAria" })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
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
