import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@zedi/ui";
import Container from "@/components/layout/Container";

/**
 * PageHeader の Props。
 * Props for the PageHeader component.
 */
export interface PageHeaderProps {
  /** タイトル。文字列またはノード。 / Title text or node. */
  title?: React.ReactNode;
  /** タイトル横の小さな注釈やバッジ等。 / Slot shown next to the title (e.g. badges). */
  titleAdornment?: React.ReactNode;
  /** 戻るリンク先（相対パス）。指定時は戻るボタンを表示。 / Path for the back link; renders a back button. */
  backTo?: string;
  /** 戻るボタンの aria-label。 / aria-label for the back button. */
  backLabel?: string;
  /** 右側のアクション領域。 / Right-aligned action slot. */
  actions?: React.ReactNode;
  /** タイトル下に追加する要素（サブテキスト、タブなど）。 / Extra content rendered below the title row. */
  children?: React.ReactNode;
  /** 追加の className。 / Extra className. */
  className?: string;
}

/**
 * ページ固有のサブヘッダー（共通 `Header` の下に配置するツールバー）。
 * 戻るボタン・タイトル・アクションを横並びで表示する。
 *
 * Page-specific sub-header placed below the global `Header`.
 * Provides an inline row with back button, title, and action slot.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  titleAdornment,
  backTo,
  backLabel = "Back",
  actions,
  children,
  className,
}) => {
  return (
    <div className={className}>
      <Container className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {backTo && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              // Override `size="icon"` (h-10 w-10) and the base `[&_svg]:size-4`
              // so the back button is a touch larger and easier to tap on
              // mobile without dwarfing neighbouring controls.
              // `size="icon"`（h-10 w-10）と基底の `[&_svg]:size-4` を上書きし、
              // 戻るボタンを少し大きくしてモバイルでもタップしやすくする。
              // ただし周囲のコントロールを圧倒しない程度に抑える。
              className="h-11 w-11 shrink-0 [&_svg]:size-6"
            >
              <Link to={backTo} aria-label={backLabel}>
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
          )}
          {title != null && (
            <div className="flex min-w-0 items-center gap-2">
              {typeof title === "string" ? (
                <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
              ) : (
                title
              )}
              {titleAdornment}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </Container>
      {children && (
        <Container className="pb-3">
          <div className="min-w-0">{children}</div>
        </Container>
      )}
    </div>
  );
};

export default PageHeader;
