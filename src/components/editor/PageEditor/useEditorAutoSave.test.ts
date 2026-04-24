import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEditorAutoSave } from "./useEditorAutoSave";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";
import { createWikiLinkContent } from "@/test/testDatabase";
import { pageKeys } from "@/hooks/usePageQueries";

describe("useEditorAutoSave", () => {
  const pageId = "page-1";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("syncWikiLinks 連携", () => {
    it("保存成功後に syncWikiLinks が1回呼ばれ、引数が [pageId, extractWikiLinksFromContent(content)] と一致する", async () => {
      const contentWithLinks = createWikiLinkContent(["Page A", "Page B"]);
      const syncWikiLinks = vi.fn().mockResolvedValue(undefined);
      const onSave = vi.fn().mockResolvedValue(true);
      const onSaveContentOnly = vi.fn().mockResolvedValue(true);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly,
          syncWikiLinks,
        }),
      );

      act(() => {
        result.current.saveChanges("My Title", contentWithLinks);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({
        title: "My Title",
        content: contentWithLinks,
      });

      const expectedWikiLinks = extractWikiLinksFromContent(contentWithLinks);
      expect(expectedWikiLinks.length).toBeGreaterThan(0);
      expect(syncWikiLinks).toHaveBeenCalledTimes(1);
      expect(syncWikiLinks).toHaveBeenCalledWith(pageId, expectedWikiLinks);
    });

    it("WikiLink が含まれない content でも syncWikiLinks は空配列で呼ばれる（stale cleanup のため、issue #725 Phase 1 レビュー指摘）", async () => {
      const plainContent = JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "No links" }] }],
      });
      const syncWikiLinks = vi.fn().mockResolvedValue(undefined);
      const onSave = vi.fn().mockResolvedValue(true);
      const onSaveContentOnly = vi.fn().mockResolvedValue(true);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly,
          syncWikiLinks,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", plainContent);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(extractWikiLinksFromContent(plainContent)).toHaveLength(0);
      // issue #725 Phase 1 レビュー指摘: Mark が無くても同期呼び出しは走らせて
      // サーバ側の stale エッジを空配列 delta で削除させる。
      // Always call sync with an empty array so stale edges cleared on save.
      expect(syncWikiLinks).toHaveBeenCalledTimes(1);
      expect(syncWikiLinks).toHaveBeenCalledWith(pageId, []);
    });

    it("tag marks あり + syncTags 指定時は syncTags が呼ばれる (issue #725 Phase 1)", async () => {
      const tagContent = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                marks: [{ type: "tag", attrs: { name: "tech", exists: false, referenced: false } }],
                text: "#tech",
              },
            ],
          },
        ],
      });
      const syncWikiLinks = vi.fn().mockResolvedValue(undefined);
      const syncTags = vi.fn().mockResolvedValue(undefined);
      const onSave = vi.fn().mockResolvedValue(true);
      const onSaveContentOnly = vi.fn().mockResolvedValue(true);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly,
          syncWikiLinks,
          syncTags,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", tagContent);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(syncTags).toHaveBeenCalledTimes(1);
      expect(syncTags).toHaveBeenCalledWith("page-1", [{ name: "tech" }]);
      // Wiki マークは無いが、stale cleanup のため空配列で 1 回呼ぶ契約。
      // No wiki marks, but we still call syncWikiLinks with `[]` so stale
      // wiki edges get delta-deleted (issue #725 Phase 1 review feedback).
      expect(syncWikiLinks).toHaveBeenCalledTimes(1);
      expect(syncWikiLinks).toHaveBeenCalledWith("page-1", []);
    });

    it("syncTags 未指定ならタグがあっても呼ばれない (backward compat)", async () => {
      const tagContent = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                marks: [{ type: "tag", attrs: { name: "tech", exists: false, referenced: false } }],
                text: "#tech",
              },
            ],
          },
        ],
      });
      const syncWikiLinks = vi.fn().mockResolvedValue(undefined);
      const onSave = vi.fn().mockResolvedValue(true);
      const onSaveContentOnly = vi.fn().mockResolvedValue(true);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly,
          syncWikiLinks,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", tagContent);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // syncTags prop が無ければタグ同期はスキップ。一方 syncWikiLinks は
      // 空配列（wiki マーク無し）でも呼んで stale cleanup を走らせる。
      expect(syncWikiLinks).toHaveBeenCalledTimes(1);
      expect(syncWikiLinks).toHaveBeenCalledWith(pageId, []);
    });

    it("保存がスキップ（didSave false）でも syncWikiLinks は呼ばれる", async () => {
      const contentWithLinks = createWikiLinkContent(["Page A"]);
      const syncWikiLinks = vi.fn().mockResolvedValue(undefined);
      const onSave = vi.fn().mockResolvedValue(false); // skipped

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly: vi.fn().mockResolvedValue(false),
          syncWikiLinks,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", contentWithLinks);
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const expectedWikiLinks = extractWikiLinksFromContent(contentWithLinks);
      expect(syncWikiLinks).toHaveBeenCalledTimes(1);
      expect(syncWikiLinks).toHaveBeenCalledWith(pageId, expectedWikiLinks);
    });
  });

  describe("onSaveSuccess", () => {
    it("保存成功時に onSaveSuccess が1回呼ばれる", async () => {
      const onSaveSuccess = vi.fn();
      const onSave = vi.fn().mockResolvedValue(true);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly: vi.fn().mockResolvedValue(true),
          syncWikiLinks: vi.fn().mockResolvedValue(undefined),
          onSaveSuccess,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", "{}");
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    });

    it("保存が false のときは onSaveSuccess は呼ばれない", async () => {
      const onSaveSuccess = vi.fn();
      const onSave = vi.fn().mockResolvedValue(false);

      const { result } = renderHook(() =>
        useEditorAutoSave({
          pageId,
          debounceMs: 0,
          onSave,
          onSaveContentOnly: vi.fn().mockResolvedValue(false),
          syncWikiLinks: vi.fn().mockResolvedValue(undefined),
          onSaveSuccess,
        }),
      );

      act(() => {
        result.current.saveChanges("Title", "{}");
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(onSaveSuccess).not.toHaveBeenCalled();
    });
  });

  describe("保存成功時の linkedPages 無効化（3.5）", () => {
    it("onSaveSuccess で queryClient.invalidateQueries が linkedPages の queryKey で1回呼ばれる", async () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const userId = "user-1";
      const currentPageId = "page-1";
      const linkedPagesKey = [...pageKeys.all, "linkedPages", userId, currentPageId];

      const useAutoSaveWithInvalidate = () => {
        const client = useQueryClient();
        return useEditorAutoSave({
          pageId: currentPageId,
          debounceMs: 0,
          onSave: vi.fn().mockResolvedValue(true),
          onSaveContentOnly: vi.fn().mockResolvedValue(true),
          syncWikiLinks: vi.fn().mockResolvedValue(undefined),
          onSaveSuccess: () => {
            client.invalidateQueries({ queryKey: linkedPagesKey });
          },
        });
      };

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(useAutoSaveWithInvalidate, { wrapper });

      act(() => {
        result.current.saveChanges("Title", "{}");
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: linkedPagesKey });
    });
  });
});
