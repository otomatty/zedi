import React, { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import type { ReferencedPage } from "../../types/aiChat";

const LONG_PRESS_MS = 500;

export interface UserMessageBubbleProps {
  content: string;
  referencedPages?: ReferencedPage[];
  messageId: string;
  onEditMessage: (messageId: string, newContent: string) => void;
  isStreaming: boolean;
}

/** Render user message content with inline @PageTitle styled as badges */
export function renderUserContent(content: string, referencedPages?: ReferencedPage[]) {
  if (!referencedPages || referencedPages.length === 0) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
  }

  const titleToPage = new Map(referencedPages.map((p) => [`@${p.title}`, p]));
  const escapedTitles = referencedPages.map((p) => p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escapedTitles.join("|")}))(?=\\s|$)`, "g");
  const parts = content.split(pattern);

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const matchedRef = titleToPage.get(part);
        if (matchedRef) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary-foreground/20 px-1.5 py-0 align-baseline text-xs font-medium text-primary-foreground/90"
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
}

export function UserMessageBubble({
  content,
  referencedPages,
  messageId,
  onEditMessage,
  isStreaming,
}: UserMessageBubbleProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const lastPointerTypeRef = useRef<string>("");

  const canEdit = !isStreaming;

  const startEdit = useCallback(() => {
    if (!canEdit) return;
    setEditValue(content);
    setIsEditing(true);
  }, [canEdit, content]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(content);
  }, [content]);

  const submitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onEditMessage(messageId, trimmed);
      setIsEditing(false);
    }
  }, [editValue, messageId, onEditMessage]);

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

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

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
          className="min-h-[80px] w-full resize-y rounded border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1.5 text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary-foreground/50"
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
            className="rounded border border-primary-foreground/50 px-2 py-1 text-xs"
          >
            {t("aiChat.actions.cancel")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              submitEdit();
            }}
            className="rounded bg-primary-foreground/20 px-2 py-1 text-xs font-medium"
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
            }
          : undefined
      }
      onClick={canEdit ? handleClick : undefined}
      onPointerDown={canEdit ? handlePointerDown : undefined}
      onPointerUp={canEdit ? handlePointerUp : undefined}
      onPointerLeave={canEdit ? handlePointerUp : undefined}
    >
      {renderUserContent(content, referencedPages)}
    </div>
  );
}
