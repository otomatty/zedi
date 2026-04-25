import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useTagStatusSync } from "./useTagStatusSync";

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
        // issue #737: `pageTitleToId` を返すモック契約。
        // Mock contract for issue #737.
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

/**
 * Mock a Tiptap editor with a single tag Mark so we can observe attribute
 * updates. Mirrors the shape used in `useWikiLinkStatusSync.test.tsx`.
 *
 * タグ Mark を 1 つ持つ Tiptap エディタのモック。`useWikiLinkStatusSync` の
 * テストと同じ雛形で属性更新を観測する。
 */
function createMockEditor() {
  const tagMark = {
    type: { name: "tag" },
    attrs: { name: "Beta", exists: false, referenced: false },
  };

  const chainApi = {
    setTextSelection: vi.fn(() => chainApi),
    extendMarkRange: vi.fn(() => chainApi),
    updateAttributes: vi.fn((_name: string, attrs: { exists: boolean; referenced: boolean }) => {
      tagMark.attrs = { ...tagMark.attrs, ...attrs };
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
              node: { isText: boolean; marks: (typeof tagMark)[]; nodeSize: number },
              pos: number,
            ) => void,
          ) => {
            visitor(
              {
                isText: true,
                marks: [tagMark],
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
    tagMark,
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
  useTagStatusSync({
    editor: editor as never,
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#Beta",
              marks: [
                {
                  type: "tag",
                  attrs: { name: "Beta", exists: false, referenced: false },
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

describe("useTagStatusSync (issue #725 Phase 1)", () => {
  beforeEach(() => {
    mockNotePagesData = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates tag mark exists/referenced when the note-scoped page set grows to include the tag name", async () => {
    const { editor, tagMark, chainApi } = createMockEditor();
    const onChange = vi.fn();

    const view = render(<Harness editor={editor} onChange={onChange} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // 初期状態ではページが未作成なので `exists` は false のまま、`onChange` 無呼び。
    // No pages yet → exists stays false, onChange untouched.
    expect(onChange).not.toHaveBeenCalled();
    expect(tagMark.attrs.exists).toBe(false);

    // タグ名と同じ title のページがノート内に現れたら `exists: true` に更新される。
    // A page matching the tag name appears → exists flips to true.
    mockNotePagesData = [{ id: "page-beta", title: "Beta" }];
    view.rerender(<Harness editor={editor} onChange={onChange} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    // issue #737: 解決時には `targetId` も同時に payload に乗る。
    // Resolution also writes `targetId` (issue #737).
    expect(chainApi.updateAttributes).toHaveBeenCalledWith("tag", {
      exists: true,
      referenced: false,
      targetId: "page-beta",
    });
    expect(tagMark.attrs.exists).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
