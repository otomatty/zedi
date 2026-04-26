import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useWikiLinkStatusSync } from "./useWikiLinkStatusSync";

type MockNotePage = { id: string; title: string };

let mockNotePagesData: MockNotePage[] | undefined;

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotePages: vi.fn(() => ({
    data: mockNotePagesData,
  })),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useWikiLinkExistsChecker: vi.fn(
    (options?: { notePages?: MockNotePage[]; pageNoteId?: string | null }) => ({
      checkExistence: vi.fn(async (titles: string[]) => {
        const inScope = options?.pageNoteId ? (options.notePages ?? []) : [];
        const pageTitles = new Set(inScope.map((page) => page.title.toLowerCase().trim()));
        // issue #737: `pageTitleToId` を返すモック契約。`targetId` 解決を伴う
        // シナリオを検証できるよう、note スコープ内ページから title→id を構築する。
        // Mock contract for issue #737. Build a title→id map from in-scope
        // pages so `targetId` resolution paths are testable.
        const pageTitleToId = new Map<string, string>(
          inScope.map((page) => [page.title.toLowerCase().trim(), page.id]),
        );
        return {
          pageTitles,
          referencedTitles: new Set<string>(),
          pageTitleToId,
        };
      }),
    }),
  ),
}));

function createMockEditor() {
  const wikiLinkMark = {
    type: { name: "wikiLink" },
    attrs: { title: "Beta", exists: false, referenced: false },
  };

  const chainApi = {
    setTextSelection: vi.fn(() => chainApi),
    extendMarkRange: vi.fn(() => chainApi),
    updateAttributes: vi.fn((_name: string, attrs: { exists: boolean; referenced: boolean }) => {
      wikiLinkMark.attrs = { ...wikiLinkMark.attrs, ...attrs };
      return chainApi;
    }),
    run: vi.fn(() => true),
  };

  return {
    editor: {
      state: {
        doc: {
          descendants: (
            visitor: (
              node: { isText: boolean; marks: (typeof wikiLinkMark)[]; nodeSize: number },
              pos: number,
            ) => void,
          ) => {
            visitor(
              {
                isText: true,
                marks: [wikiLinkMark],
                nodeSize: 4,
              },
              1,
            );
          },
        },
      },
      chain: vi.fn(() => chainApi),
      getJSON: vi.fn(() => ({ type: "doc", content: [] })),
    },
    wikiLinkMark,
    chainApi,
  };
}

function Harness({
  editor,
  onChange,
}: {
  editor: ReturnType<typeof createMockEditor>["editor"];
  onChange: (content: string) => void;
}) {
  useWikiLinkStatusSync({
    editor: editor as never,
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Beta",
              marks: [
                {
                  type: "wikiLink",
                  attrs: { title: "Beta", exists: false, referenced: false },
                },
              ],
            },
          ],
        },
      ],
    }),
    pageId: "page-1",
    onChange,
    pageNoteId: "note-1",
  });

  return null;
}

describe("useWikiLinkStatusSync", () => {
  beforeEach(() => {
    mockNotePagesData = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-runs status sync when the note-scoped page set changes", async () => {
    const { editor, wikiLinkMark, chainApi } = createMockEditor();
    const onChange = vi.fn();

    const view = render(<Harness editor={editor} onChange={onChange} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(wikiLinkMark.attrs.exists).toBe(false);

    mockNotePagesData = [{ id: "page-beta", title: "Beta" }];
    view.rerender(<Harness editor={editor} onChange={onChange} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // issue #737: 解決時には `targetId` も同時に payload に乗る。
    // Resolution also writes `targetId` (issue #737).
    expect(chainApi.updateAttributes).toHaveBeenCalledWith("wikiLink", {
      exists: true,
      referenced: false,
      targetId: "page-beta",
    });
    expect(wikiLinkMark.attrs.exists).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
