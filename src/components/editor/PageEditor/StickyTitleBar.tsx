import React from "react";
import { cn } from "@/lib/utils";
import Container from "@/components/layout/Container";

export interface StickyTitleBarProps {
  /** バーを表示するか（タイトルがビューポート外のとき true） */
  visible: boolean;
  /** 表示するタイトル（1行で省略表示） */
  title: string;
  /** クリック時にタイトル位置へスクロールする処理 */
  onClick: () => void;
}

/**
 * タイトルがビューポート外に出たとき、ヘッダー直下に表示するバー。
 * クリックでタイトル位置へスクロールする。
 */
export const StickyTitleBar: React.FC<StickyTitleBarProps> = ({
  visible,
  title,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "sticky top-16 z-40 w-full text-left",
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        "border-b border-border",
        "h-10 flex items-center",
        "transition-all duration-200",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 pointer-events-none invisible translate-y-[-4px]"
      )}
      aria-label="タイトルまでスクロール"
    >
      <Container className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {title || "無題のページ"}
        </span>
      </Container>
    </button>
  );
};
