/**
 * Tests for {@link NoteTitleSwitcher}, the note-title-as-switcher component
 * that replaces the former header `NoteSwitcher`. It renders the current
 * note title as a dropdown trigger on note detail / settings / members
 * pages, listing the user's notes (default note pinned, then `updatedAt`
 * DESC). Footer shortcuts link to `/notes?new=1` and `/notes`.
 *
 * 旧ヘッダー `NoteSwitcher` を置き換えるノートタイトル兼切替 UI のテスト。
 * ノート詳細/設定/メンバー画面で、現在のタイトルをトリガーとしてドロップダウンを開く。
 * デフォルトノートを先頭に固定し、それ以外は `updatedAt` 降順で並べる。
 * フッターは `/notes?new=1` と `/notes` への 2 項目を保持する。
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { NoteSummary } from "@/types/note";

type UseNotesResult = {
  data: NoteSummary[] | undefined;
  isLoading: boolean;
};
type UseMyNoteResult = {
  data: { id: string; is_default: boolean } | undefined;
  isLoading: boolean;
};
type UseAuthResult = {
  isSignedIn: boolean;
  isLoaded: boolean;
  userId: string | null;
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "notes.switcher.trigger": "ノートを切り替え",
        "notes.switcher.heading": "ノート",
        "notes.switcher.defaultBadge": "既定",
        "notes.switcher.empty": "まだノートがありません",
        "notes.switcher.loading": "読み込み中…",
        "notes.switcher.allNotes": "すべてのノートを見る",
        "notes.switcher.newNote": "新規ノートを作成",
        "notes.untitledNote": "無題のノート",
      };
      return table[key] ?? fallback ?? key;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
  };
});

const useNotesMock: Mock<() => UseNotesResult> = vi.fn();
const useMyNoteMock: Mock<(options?: { enabled?: boolean }) => UseMyNoteResult> = vi.fn();
const useAuthMock: Mock<() => UseAuthResult> = vi.fn();

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotes: () => useNotesMock(),
  useMyNote: (options?: { enabled?: boolean }) => useMyNoteMock(options),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { NoteTitleSwitcher } from "./NoteTitleSwitcher";

function makeNote(overrides: Partial<NoteSummary> & { id: string }): NoteSummary {
  return {
    id: overrides.id,
    ownerUserId: overrides.ownerUserId ?? "user-1",
    title: overrides.title ?? "",
    visibility: overrides.visibility ?? "private",
    editPermission: overrides.editPermission ?? "owner_only",
    isOfficial: overrides.isOfficial ?? false,
    isDefault: overrides.isDefault ?? false,
    viewCount: overrides.viewCount ?? 0,
    showTagFilterBar: overrides.showTagFilterBar ?? false,
    defaultFilterTags: overrides.defaultFilterTags ?? [],
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    isDeleted: overrides.isDeleted ?? false,
    role: overrides.role ?? "owner",
    pageCount: overrides.pageCount ?? 0,
    memberCount: overrides.memberCount ?? 0,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(
  path: string,
  props: Partial<React.ComponentProps<typeof NoteTitleSwitcher>> = {},
) {
  const merged = {
    noteId: props.noteId ?? "note-alpha",
    noteTitle: props.noteTitle ?? "Alpha note",
    variant: props.variant,
    className: props.className,
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <NoteTitleSwitcher {...merged} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const noteAlpha = makeNote({ id: "note-alpha", title: "Alpha note", updatedAt: 100 });
const noteBeta = makeNote({ id: "note-beta", title: "Beta note", updatedAt: 300 });
const noteGamma = makeNote({ id: "note-gamma", title: "Gamma note", updatedAt: 200 });
const defaultNote = makeNote({ id: "note-default", title: "My default", updatedAt: 50 });

describe("NoteTitleSwitcher", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ isSignedIn: true, isLoaded: true, userId: "user-1" });
    useNotesMock.mockReturnValue({
      data: [noteAlpha, noteBeta, noteGamma, defaultNote],
      isLoading: false,
    });
    useMyNoteMock.mockReturnValue({
      data: { id: defaultNote.id, is_default: true },
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current note title inside the trigger", () => {
    renderAt("/notes/note-alpha", { noteTitle: "Alpha note" });
    const trigger = screen.getByRole("button", { name: "ノートを切り替え" });
    expect(trigger).toHaveTextContent("Alpha note");
  });

  it("falls back to the untitled label when title is empty", () => {
    renderAt("/notes/note-alpha", { noteTitle: "   " });
    const trigger = screen.getByRole("button", { name: "ノートを切り替え" });
    expect(trigger).toHaveTextContent("無題のノート");
  });

  it("renders the title as plain text (not a button) for signed-out users", () => {
    useAuthMock.mockReturnValue({ isSignedIn: false, isLoaded: true, userId: null });
    renderAt("/notes/note-alpha", { noteTitle: "Public note" });
    expect(screen.queryByRole("button", { name: "ノートを切り替え" })).not.toBeInTheDocument();
    expect(screen.getByText("Public note")).toBeInTheDocument();
  });

  it("does not render note items until the trigger is clicked", () => {
    renderAt("/notes/note-alpha");
    expect(screen.queryByRole("menuitem", { name: /Alpha note/ })).not.toBeInTheDocument();
  });

  it("pins the default note first and sorts the rest by updatedAt DESC", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");

    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const items = await screen.findAllByRole("menuitem");
    const noteRowNames = items
      .map((el) => el.textContent ?? "")
      .filter((text) => /My default|Alpha note|Beta note|Gamma note/.test(text));

    expect(noteRowNames[0]).toMatch(/My default/);
    expect(noteRowNames[0]).toMatch(/既定/);
    expect(noteRowNames[1]).toMatch(/Beta note/);
    expect(noteRowNames[2]).toMatch(/Gamma note/);
    expect(noteRowNames[3]).toMatch(/Alpha note/);
  });

  it("marks the active note (matching `noteId` prop) with aria-current=true", async () => {
    const user = userEvent.setup();
    // 設定ページのように /notes/:noteId/settings 配下でも noteId prop で
    // アクティブ判定できる。
    // Even on /notes/:noteId/settings the prop drives the highlight.
    renderAt("/notes/note-beta/settings", { noteId: "note-beta", noteTitle: "Beta note" });
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const betaItem = await screen.findByRole("menuitem", { name: /Beta note/ });
    expect(betaItem).toHaveAttribute("aria-current", "true");

    const alphaItem = await screen.findByRole("menuitem", { name: /Alpha note/ });
    expect(alphaItem).not.toHaveAttribute("aria-current", "true");
  });

  it("navigates to /notes/:noteId when a row is selected", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const betaItem = await screen.findByRole("menuitem", { name: /Beta note/ });
    expect(betaItem).toHaveAttribute("href", "/notes/note-beta");
    await user.click(betaItem);
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/note-beta");
  });

  it("renders an 'all notes' footer that links to /notes", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const allLink = await screen.findByRole("menuitem", { name: "すべてのノートを見る" });
    expect(allLink).toHaveAttribute("href", "/notes");
  });

  it("renders a 'new note' footer that links to /notes?new=1", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const newLink = await screen.findByRole("menuitem", { name: "新規ノートを作成" });
    expect(newLink).toHaveAttribute("href", "/notes?new=1");
  });

  it("shows an empty hint and keeps the footer shortcuts", async () => {
    useNotesMock.mockReturnValue({ data: [], isLoading: false });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(await screen.findByText("まだノートがありません")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "新規ノートを作成" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "すべてのノートを見る" })).toBeInTheDocument();
  });

  it("shows a loading hint while fetching", async () => {
    useNotesMock.mockReturnValue({ data: undefined, isLoading: true });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: true });
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(await screen.findByText("読み込み中…")).toBeInTheDocument();
  });

  it("caps the listed notes at 50 entries", async () => {
    const many: NoteSummary[] = Array.from({ length: 80 }, (_, i) =>
      makeNote({ id: `note-${i}`, title: `Note ${i}`, updatedAt: i }),
    );
    useNotesMock.mockReturnValue({ data: many, isLoading: false });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    renderAt("/notes/note-0", { noteId: "note-0", noteTitle: "Note 0" });
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const rows = (await screen.findAllByRole("menuitem")).filter((el) =>
      /^Note \d+$/.test((el.textContent ?? "").trim()),
    );
    expect(rows.length).toBe(50);
    expect(rows[0].textContent?.trim()).toBe("Note 79");
  });

  it("does not list soft-deleted notes", async () => {
    useNotesMock.mockReturnValue({
      data: [
        makeNote({ id: "note-live", title: "Live note", updatedAt: 200 }),
        makeNote({ id: "note-dead", title: "Dead note", updatedAt: 300, isDeleted: true }),
      ],
      isLoading: false,
    });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    renderAt("/notes/note-live", { noteId: "note-live", noteTitle: "Live note" });
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(screen.queryByRole("menuitem", { name: /Dead note/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /Live note/ })).toBeInTheDocument();
  });

  it("applies subtitle text styling when variant=subtitle", () => {
    renderAt("/notes/note-alpha/settings", {
      noteId: "note-alpha",
      noteTitle: "Alpha note",
      variant: "subtitle",
    });
    const trigger = screen.getByRole("button", { name: "ノートを切り替え" });
    expect(trigger.className).toMatch(/text-sm/);
    expect(trigger.className).not.toMatch(/text-xl/);
  });
});
