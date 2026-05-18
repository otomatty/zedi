import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";

/**
 *
 */
export interface PageTitleBlockProps {
  /** 表示・編集するタイトル */
  title: string;
  /** タイトル変更時のコールバック（編集モード時） */
  onTitleChange?: (value: string) => void;
  /** 閲覧専用なら true */
  isReadOnly?: boolean;
  /** バリデーションエラー（例: 重複）。ある場合にスタイル表示 */
  errorMessage?: string | null;
  /** プレースホルダー。未指定時は i18n `editor.titlePlaceholder`。 / Placeholder; defaults to i18n `editor.titlePlaceholder`. */
  placeholder?: string;
  /** IntersectionObserver 用。タイトルブロックのルート要素に ref を付与 */
  titleRef?: React.Ref<HTMLDivElement | null>;
  /** Enter キー押下時（変換確定後）にコンテンツへフォーカスを移す場合に渡す */
  onEnterMoveToContent?: () => void;
}

/**
 * コンテンツ上部にタイトルを表示または編集するブロック。
 * スクロール検知用の ref を渡せる。
 */
export const PageTitleBlock: React.FC<PageTitleBlockProps> = ({
  title,
  onTitleChange,
  isReadOnly = false,
  errorMessage = null,
  placeholder,
  titleRef,
  onEnterMoveToContent,
}) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("editor.titlePlaceholder");
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      onEnterMoveToContent?.();
    },
    [onEnterMoveToContent],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\n/g, "");
      onTitleChange?.(value);
    },
    [onTitleChange],
  );

  // ハンドラが渡されない場合は表示専用 `<h1>` にフォールバックし、制御 input の
  // value 固定で「入力できない」状態にならないようにする。
  // When no handler is supplied, render a static `<h1>` so the controlled input
  // does not appear editable while silently dropping keystrokes.
  if (isReadOnly || !onTitleChange) {
    return (
      <div ref={titleRef} className="pt-6 pb-2">
        <h1 className="text-2xl font-semibold break-words whitespace-normal">
          {title || t("common.untitledPage")}
        </h1>
      </div>
    );
  }

  // 編集タイトルは当該ページの h1。本文は h2 起点（editor）と揃えて 1 ページ 1 見出しにする
  // Editable page title is the only &lt;h1&gt;; body headings start at h2 in the editor
  return (
    <div ref={titleRef} className="pt-6 pb-2">
      <h1 className="m-0 break-words whitespace-normal">
        <input
          type="text"
          value={title}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          className={cn(
            "w-full border-0 bg-transparent text-2xl font-semibold",
            "placeholder:text-muted-foreground",
            "focus:outline-none",
            "min-h-[2.5rem] py-0 leading-tight",
            errorMessage ? "text-destructive" : "",
          )}
          aria-label={resolvedPlaceholder}
          aria-invalid={Boolean(errorMessage)}
        />
      </h1>
      {errorMessage && (
        <p className="text-destructive mt-1 text-sm" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
