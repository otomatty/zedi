/**
 * Tests for {@link NoteSwitcher}, the header dropdown that lets users hop
 * between their notes without leaving the editor surface (issue #827). The
 * default note is pinned to the top with a badge; the rest of the rows are
 * sorted by `updatedAt` descending. The footer links to `/notes` ("see all")
 * and offers a quick "new note" entry that delegates to the existing
 * create-note dialog on the notes index page.
 *
 * ヘッダーにノート切替用のドロップダウン {@link NoteSwitcher} を追加するテスト
 * （issue #827）。デフォルトノートはバッジ付きで先頭に固定し、それ以外は
 * `updatedAt` 降順で並べる。フッターには `/notes`（一覧）への "see all" と
 * 新規ノート作成への導線を置き、新規作成は `Notes` ページの既存ダイアログに
 * 委譲する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { NoteSummary } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const table: Record<string, string> = {
        "nav.menu": "メニュー",
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

const useNotesMock = vi.fn();
const useMyNoteMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotes: () => useNotesMock(),
  useMyNote: (options?: { enabled?: boolean }) => useMyNoteMock(options),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { NoteSwitcher } from "./NoteSwitcher";

function makeNote(overrides: Partial<NoteSummary> & { id: string }): NoteSummary {
  return {
    id: overrides.id,
    ownerUserId: overrides.ownerUserId ?? "user-1",
    title: overrides.title ?? "",
    visibility: overrides.visibility ?? "private",
    editPermission: overrides.editPermission ?? "owner_only",
    isOfficial: overrides.isOfficial ?? false,
    viewCount: overrides.viewCount ?? 0,
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <NoteSwitcher />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const noteAlpha = makeNote({
  id: "note-alpha",
  title: "Alpha note",
  updatedAt: 100,
});
const noteBeta = makeNote({
  id: "note-beta",
  title: "Beta note",
  updatedAt: 300,
});
const noteGamma = makeNote({
  id: "note-gamma",
  title: "Gamma note",
  updatedAt: 200,
});
const defaultNote = makeNote({
  id: "note-default",
  title: "My default",
  updatedAt: 50,
});

describe("NoteSwitcher", () => {
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

  it("renders nothing when the user is signed out", () => {
    useAuthMock.mockReturnValue({ isSignedIn: false, isLoaded: true, userId: null });
    renderAt("/notes/note-alpha");
    expect(screen.queryByRole("button", { name: "ノートを切り替え" })).not.toBeInTheDocument();
  });

  it("renders the trigger with the switcher aria-label when signed in", () => {
    renderAt("/notes/note-alpha");
    expect(screen.getByRole("button", { name: "ノートを切り替え" })).toBeInTheDocument();
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
    // Filter to note rows (footer items have distinct names).
    const noteRowNames = items
      .map((el) => el.textContent ?? "")
      .filter((text) => /My default|Alpha note|Beta note|Gamma note/.test(text));

    expect(noteRowNames[0]).toMatch(/My default/);
    expect(noteRowNames[0]).toMatch(/既定/);
    // Beta (updatedAt=300) > Gamma (200) > Alpha (100).
    expect(noteRowNames[1]).toMatch(/Beta note/);
    expect(noteRowNames[2]).toMatch(/Gamma note/);
    expect(noteRowNames[3]).toMatch(/Alpha note/);
  });

  it("marks the active note with aria-current=true", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-beta");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const betaItem = await screen.findByRole("menuitem", { name: /Beta note/ });
    expect(betaItem).toHaveAttribute("aria-current", "true");

    const alphaItem = await screen.findByRole("menuitem", { name: /Alpha note/ });
    expect(alphaItem).not.toHaveAttribute("aria-current", "true");
  });

  it("does not mark anything active on /notes (the index)", async () => {
    const user = userEvent.setup();
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const noteItems = (await screen.findAllByRole("menuitem")).filter((el) =>
      /Alpha note|Beta note|Gamma note|My default/.test(el.textContent ?? ""),
    );
    for (const item of noteItems) {
      expect(item).not.toHaveAttribute("aria-current", "true");
    }
  });

  it("treats sub-paths like /notes/:noteId/:pageId as still on that note", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-gamma/some-page");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const gammaItem = await screen.findByRole("menuitem", { name: /Gamma note/ });
    expect(gammaItem).toHaveAttribute("aria-current", "true");
  });

  it("ignores the literal /notes/me landing path for active highlighting", async () => {
    const user = userEvent.setup();
    renderAt("/notes/me");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const noteItems = (await screen.findAllByRole("menuitem")).filter((el) =>
      /Alpha note|Beta note|Gamma note|My default/.test(el.textContent ?? ""),
    );
    for (const item of noteItems) {
      expect(item).not.toHaveAttribute("aria-current", "true");
    }
  });

  it("navigates to /notes/:noteId when a row is selected", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const betaItem = await screen.findByRole("menuitem", { name: /Beta note/ });
    expect(betaItem).toHaveAttribute("href", "/notes/note-beta");
  });

  it("renders an 'all notes' footer that links to /notes", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const allLink = await screen.findByRole("menuitem", {
      name: "すべてのノートを見る",
    });
    expect(allLink).toHaveAttribute("href", "/notes");
  });

  it("renders a 'new note' footer that links to /notes?new=1", async () => {
    const user = userEvent.setup();
    renderAt("/notes/note-alpha");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const newLink = await screen.findByRole("menuitem", { name: "新規ノートを作成" });
    expect(newLink).toHaveAttribute("href", "/notes?new=1");
  });

  it("falls back to a placeholder when a note has an empty title", async () => {
    useNotesMock.mockReturnValue({
      data: [makeNote({ id: "note-untitled", title: "", updatedAt: 999 })],
      isLoading: false,
    });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(await screen.findByRole("menuitem", { name: /無題のノート/ })).toBeInTheDocument();
  });

  it("shows an empty hint when the user has no notes", async () => {
    useNotesMock.mockReturnValue({ data: [], isLoading: false });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: false });
    const user = userEvent.setup();
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(await screen.findByText("まだノートがありません")).toBeInTheDocument();
    // The footer shortcuts must remain available even when the list is empty.
    expect(screen.getByRole("menuitem", { name: "新規ノートを作成" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "すべてのノートを見る" })).toBeInTheDocument();
  });

  it("shows a loading hint while the notes list is fetching", async () => {
    useNotesMock.mockReturnValue({ data: undefined, isLoading: true });
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: true });
    const user = userEvent.setup();
    renderAt("/notes");
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
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    const rows = (await screen.findAllByRole("menuitem")).filter((el) =>
      /^Note \d+$/.test((el.textContent ?? "").trim()),
    );
    expect(rows.length).toBe(50);
    // 80 -> sorted by updatedAt DESC, expect Note 79 first.
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
    renderAt("/notes");
    await user.click(screen.getByRole("button", { name: "ノートを切り替え" }));

    expect(screen.queryByRole("menuitem", { name: /Dead note/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /Live note/ })).toBeInTheDocument();
  });
});
