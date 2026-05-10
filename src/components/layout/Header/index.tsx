import React from "react";
import Container from "@/components/layout/Container";
import { cn, useIsMobile } from "@zedi/ui";
import { HeaderLogo } from "./HeaderLogo";
import { HeaderSearchBar } from "./HeaderSearchBar";
import { NavigationMenu } from "./NavigationMenu";
import { NoteSwitcher } from "./NoteSwitcher";
import { UnifiedMenu } from "./UnifiedMenu";
import { MobileHeader } from "../MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";
import { useHeaderActions } from "@/contexts/HeaderActionsContext";

interface HeaderProps {
  className?: string;
}

/**
 * Sticky app header. On desktop hosts the logo, the search bar, a
 * navigation dropdown (Home / Notes) and the user-only menu. On mobile
 * delegates to {@link MobileHeader} — the mobile bar is a compact title
 * with only a search icon; navigation / account moved to the bottom nav.
 *
 * 固定ヘッダー。デスクトップではロゴ・検索・機能ナビゲーション（Home / Notes）・
 * ユーザー専用メニューを並べる。モバイルでは {@link MobileHeader} にデリゲートし、
 * コンパクトなタイトル + 検索アイコンだけを表示する（ナビ・アカウントはボトムナビへ移譲）。
 */
const Header: React.FC<HeaderProps> = ({ className }) => {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;
  const isMobile = useIsMobile();
  const headerActions = useHeaderActions();

  if (isMobile) {
    return <MobileHeader className={className} />;
  }

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 border-b",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-[4.5rem] items-center justify-between gap-3 md:gap-4">
        {/* Left: Logo + NoteSwitcher.
            The switcher sits next to the logo so users on any AppLayout
            page can hop between their notes without leaving the editor
            surface. Hidden for guests; the inner component handles that.
            See issue #827.
            左: ロゴと NoteSwitcher。AppLayout 配下のどのページからでも
            ノートを切り替えられるよう、ロゴの隣に配置する。未ログイン時は
            内部で非表示になる。issue #827。 */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
          <div className="hidden items-center gap-3 md:flex">
            <HeaderLogo />
          </div>
          <NoteSwitcher />
        </div>

        {/* Center: Search bar with optional left/right action slots wrapping it.
            中央: 検索バー。両脇にページ固有アクション用のスロットを確保する。 */}
        <div className="flex max-w-xl min-w-0 flex-1 items-center justify-center gap-2 md:mx-2">
          <div
            ref={headerActions?.setLeftSlot ?? null}
            className="flex shrink-0 items-center gap-1 empty:hidden"
            data-testid="header-left-slot"
          />
          {hasSearchContext && <HeaderSearchBar />}
          <div
            ref={headerActions?.setRightSlot ?? null}
            className="flex shrink-0 items-center gap-1 empty:hidden"
            data-testid="header-right-slot"
          />
        </div>

        {/* Right: navigation dropdown and user-only menu.
            右: 機能ナビゲーションのドロップダウンとユーザー専用メニュー。
            Keep a slightly wider gap between the square nav trigger and the
            circular avatar trigger to mitigate mis-taps.
            四角いナビトリガーと丸いアバターの間にやや広めの gap を取り、誤タップを抑える。 */}
        <div className="flex shrink-0 items-center gap-2">
          {!isSignedIn && (
            <span className="text-muted-foreground hidden text-xs md:inline">
              {t("common.guestSyncPrompt")}
            </span>
          )}
          <NavigationMenu />
          <UnifiedMenu />
        </div>
      </Container>
    </header>
  );
};

export default Header;
