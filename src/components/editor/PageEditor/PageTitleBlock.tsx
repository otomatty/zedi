import React, { useCallback } from "react";
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
  /** Enter キー押下時（変換確定後）にコンテンツへフォーカスを移す場合に渡す */
  onEnterMoveToContent?: () => void;
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
  onEnterMoveToContent,
}) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      onEnterMoveToContent?.();
    },
    [onEnterMoveToContent]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\n/g, "");
      onTitleChange?.(value);
    },
    [onTitleChange]
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
      <input
        type="text"
        value={title}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "w-full border-0 bg-transparent text-2xl font-semibold",
          "placeholder:text-muted-foreground",
          "focus:outline-none",
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
