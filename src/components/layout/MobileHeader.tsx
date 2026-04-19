import React, { useState } from "react";
import { Search } from "lucide-react";
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle, cn } from "@zedi/ui";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useTranslation } from "react-i18next";
import { HeaderLogo } from "./Header/HeaderLogo";
import { HeaderSearchBar } from "./Header/HeaderSearchBar";
import Container from "@/components/layout/Container";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";

interface MobileHeaderProps {
  className?: string;
}

/**
 * Compact mobile title bar with the app logo on the left and a search icon
 * on the right. Navigation, AI toggle and the user menu have moved to the
 * bottom nav, so this bar stays deliberately minimal (h-12) to keep
 * thumb-reach space for the content beneath it.
 *
 * モバイル用のコンパクトなタイトルバー。左にロゴ、右に検索アイコンだけを置き、
 * ナビゲーション・AI 開閉・ユーザーメニューはボトムナビへ移譲した。片手操作での
 * 親指リーチを確保するため、あえて高さ h-12 に抑えている。
 */
export const MobileHeader: React.FC<MobileHeaderProps> = ({ className }) => {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;
  const sheetTitle = t("nav.search", "Search");

  return (
    <header
      className={cn(
        "border-border sticky top-0 z-50 h-12 border-b",
        "bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur",
        className,
      )}
    >
      <Container className="flex h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <HeaderLogo />
        </div>
        {hasSearchContext && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label={t("nav.search", "Search")}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
            <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
              <SheetContent side="top" className="p-4">
                <VisuallyHidden>
                  <SheetTitle>{sheetTitle}</SheetTitle>
                  <SheetDescription>{sheetTitle}</SheetDescription>
                </VisuallyHidden>
                <HeaderSearchBar />
              </SheetContent>
            </Sheet>
          </>
        )}
      </Container>
    </header>
  );
};

export default MobileHeader;
