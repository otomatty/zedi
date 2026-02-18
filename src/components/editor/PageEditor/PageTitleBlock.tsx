import React, { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface PageTitleBlockProps {
  /** 表示・編集するタイトル */
  title: string;
  /** タイトル変更時のコールバック（編集モード時） */
  onTitleChange?: (value: string) => void;
  /** 閲覧専用なら true */
  isReadOnly?: boolean;
  /** バリデーションエラー（例: 重複）。ある場合にスタイル表示 */
  errorMessage?: string | null;
  /** プレースホルダー。デフォルト「タイトル」 */
  placeholder?: string;
  /** IntersectionObserver 用。タイトルブロックのルート要素に ref を付与 */
  titleRef?: React.Ref<HTMLDivElement | null>;
}

const DEFAULT_PLACEHOLDER = "タイトル";

/**
 * コンテンツ上部にタイトルを表示または編集するブロック。
 * スクロール検知用の ref を渡せる。
 */
export const PageTitleBlock: React.FC<PageTitleBlockProps> = ({
  title,
  onTitleChange,
  isReadOnly = false,
  errorMessage = null,
  placeholder = DEFAULT_PLACEHOLDER,
  titleRef,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (!isReadOnly) adjustHeight();
  }, [title, isReadOnly, adjustHeight]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onTitleChange?.(e.target.value);
      adjustHeight();
    },
    [onTitleChange, adjustHeight]
  );

  if (isReadOnly) {
    return (
      <div ref={titleRef} className="pt-6 pb-2">
        <h1 className="text-2xl font-semibold whitespace-normal break-words">
          {title || "無題のページ"}
        </h1>
      </div>
    );
  }

  return (
    <div ref={titleRef} className="pt-6 pb-2">
      <textarea
        ref={textareaRef}
        value={title}
        onChange={handleChange}
        placeholder={placeholder}
        rows={1}
        className={cn(
          "w-full resize-none border-0 bg-transparent text-2xl font-semibold",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:rounded",
          "min-h-[2.5rem] py-0 leading-tight",
          errorMessage ? "text-destructive" : ""
        )}
        aria-label={placeholder}
        aria-invalid={Boolean(errorMessage)}
      />
      {errorMessage && (
        <p className="text-sm text-destructive mt-1" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
