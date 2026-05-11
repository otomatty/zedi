/**
 * NoteShareUrlCopyButton: ノート画面のタイトル横で `${origin}/notes/:id` を
 * クリップボードへコピーするアイコンボタン。共有モーダル廃止に伴う代替動線。
 *
 * Tests for the share-URL copy button shown next to the note title after the
 * share modal was retired. The button only renders for `public` / `unlisted`
 * notes (URLs do not grant access on `private` / `restricted`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NoteShareUrlCopyButton } from "./NoteShareUrlCopyButton";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja" },
  }),
}));

const toastMock = vi.fn();
vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: toastMock }),
  };
});

describe("NoteShareUrlCopyButton", () => {
  beforeEach(() => {
    toastMock.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://zedi.example/notes/note-1"),
    });
  });

  it("renders nothing for private notes", () => {
    const { container } = render(<NoteShareUrlCopyButton noteId="note-1" visibility="private" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for restricted (invite-only) notes", () => {
    const { container } = render(
      <NoteShareUrlCopyButton noteId="note-1" visibility="restricted" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a copy button for public notes", () => {
    render(<NoteShareUrlCopyButton noteId="note-1" visibility="public" />);
    expect(screen.getByRole("button", { name: "notes.copyShareUrlAria" })).toBeInTheDocument();
  });

  it("renders a copy button for unlisted notes", () => {
    render(<NoteShareUrlCopyButton noteId="note-1" visibility="unlisted" />);
    expect(screen.getByRole("button", { name: "notes.copyShareUrlAria" })).toBeInTheDocument();
  });

  it("writes `${origin}/notes/:id` to the clipboard on click and toasts success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<NoteShareUrlCopyButton noteId="note-abc" visibility="public" />);
    fireEvent.click(screen.getByRole("button", { name: "notes.copyShareUrlAria" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://zedi.example/notes/note-abc");
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.linkCopied" });
  });

  it("toasts a destructive failure when clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<NoteShareUrlCopyButton noteId="note-x" visibility="unlisted" />);
    fireEvent.click(screen.getByRole("button", { name: "notes.copyShareUrlAria" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.linkCopyFailed",
        variant: "destructive",
      });
    });
  });
});
