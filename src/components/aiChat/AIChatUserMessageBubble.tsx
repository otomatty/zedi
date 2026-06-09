import React, { useRef, useState, useEffect, useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import type { ReferencedPage } from "../../types/aiChat";

const LONG_PRESS_MS = 500;

/**
 *
 */
export interface UserMessageBubbleProps {
  content: string;
  referencedPages?: ReferencedPage[];
  messageId: string;
  onEditMessage: (messageId: string, newContent: string) => void;
  isStreaming: boolean;
}

/**
 * Render user message content with inline @PageTitle styled as badges.
 *
 * `referencedPages` をキーに sort/map/RegExp/split の構築を `useMemo` 化し、
 * `memo` で props 不変時の再 render を抑える。会話が長くなるほど毎 render の
 * 正規表現再構築が累積していたのを避ける（issue #1000 Item 2）。
 *
 * Memoizes the sort/map/RegExp/split work on `referencedPages` and wraps the
 * component in `memo`, avoiding the per-render regex rebuild that accumulated
 * as conversations grew (issue #1000 Item 2).
 */
export const UserMessageContent = memo(function UserMessageContent({
  content,
  referencedPages,
}: {
  content: string;
  referencedPages?: ReferencedPage[];
}) {
  const parsed = useMemo(() => {
    if (!referencedPages || referencedPages.length === 0) return null;

    // 空タイトルは除外する。残すと `escapedTitles.join("|")` に空の選択肢が入り、
    // `@(?:Alpha|)` のように `@` 単体へ無条件マッチして表示が崩れるため。
    // Drop empty titles: otherwise `escapedTitles.join("|")` yields an empty
    // alternative (e.g. `@(?:Alpha|)`) that matches a bare `@` and breaks rendering.
    const sortedPages = [...referencedPages]
      .filter((p) => p.title.trim() !== "")
      .sort((a, b) => b.title.length - a.title.length);
    if (sortedPages.length === 0) return null;

    const titleToPage = new Map(sortedPages.map((p) => [`@${p.title}`, p]));
    const escapedTitles = sortedPages.map((p) => p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Allow boundary after @Title: whitespace, end, or punctuation (e.g. @AI Chat, @ページ。)
    const pattern = new RegExp(`(@(?:${escapedTitles.join("|")}))(?=[\\s\\p{P}\\p{S}]|$)`, "gu");
    return { titleToPage, parts: content.split(pattern) };
  }, [content, referencedPages]);

  if (!parsed) {
    return <div className="break-words whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div className="break-words whitespace-pre-wrap">
      {parsed.parts.map((part, i) => {
        const matchedRef = parsed.titleToPage.get(part);
        if (matchedRef) {
          return (
            <span
              key={i}
              className="bg-primary-foreground/20 text-primary-foreground/90 mx-0.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0 align-baseline text-xs font-medium"
            >
              <FileText className="h-3 w-3 shrink-0" />
              {matchedRef.title}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
});

/**
 *
 */
export function UserMessageBubble({
  content,
  referencedPages,
  messageId,
  onEditMessage,
  isStreaming,
}: UserMessageBubbleProps) {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const [isEditing, setIsEditing] = useState(false);
  /**
   *
   */
  const [editValue, setEditValue] = useState(content);
  /**
   *
   */
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   *
   */
  const longPressTriggeredRef = useRef(false);
  /**
   *
   */
  const lastPointerTypeRef = useRef<string>("");

  /**
   *
   */
  const canEdit = !isStreaming;

  /**
   *
   */
  const startEdit = useCallback(() => {
    if (!canEdit) return;
    setEditValue(content);
    setIsEditing(true);
  }, [canEdit, content]);

  /**
   *
   */
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(content);
  }, [content]);

  /**
   *
   */
  const submitEdit = useCallback(() => {
    /**
     *
     */
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (trimmed === content.trim()) {
      setIsEditing(false);
      return;
    }
    onEditMessage(messageId, trimmed);
    setIsEditing(false);
  }, [content, editValue, messageId, onEditMessage]);

  /**
   *
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canEdit) return;
      lastPointerTypeRef.current = e.pointerType;
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressTriggeredRef.current = true;
        startEdit();
      }, LONG_PRESS_MS);
    },
    [canEdit, startEdit],
  );

  /**
   *
   */
  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /**
   *
   */
  const handlePointerCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /**
   *
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canEdit) return;
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        e.preventDefault();
        return;
      }
      if (lastPointerTypeRef.current === "touch") return;
      startEdit();
    },
    [canEdit, startEdit],
  );

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60 focus:ring-primary-foreground/50 min-h-[80px] w-full resize-y rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") cancelEdit();
          }}
          rows={3}
          autoFocus
          aria-label={t("aiChat.actions.resend")}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cancelEdit();
            }}
            className="border-primary-foreground/50 rounded border px-2 py-1 text-xs"
          >
            {t("aiChat.actions.cancel")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              submitEdit();
            }}
            className="bg-primary-foreground/20 rounded px-2 py-1 text-xs font-medium"
          >
            {t("aiChat.actions.resend")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={canEdit ? "cursor-pointer select-none" : ""}
      role={canEdit ? "button" : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onKeyDown={
        canEdit
          ? (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                startEdit();
              }
              if (e.key === " ") {
                e.preventDefault();
                startEdit();
              }
            }
          : undefined
      }
      onClick={canEdit ? handleClick : undefined}
      onPointerDown={canEdit ? handlePointerDown : undefined}
      onPointerUp={canEdit ? handlePointerUp : undefined}
      onPointerLeave={canEdit ? handlePointerUp : undefined}
      onPointerCancel={canEdit ? handlePointerCancel : undefined}
    >
      <UserMessageContent content={content} referencedPages={referencedPages} />
    </div>
  );
}
