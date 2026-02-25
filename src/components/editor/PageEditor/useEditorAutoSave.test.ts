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

    it("WikiLink が含まれない content では syncWikiLinks は呼ばれない（保存は行う）", async () => {
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
      expect(syncWikiLinks).not.toHaveBeenCalled();
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
