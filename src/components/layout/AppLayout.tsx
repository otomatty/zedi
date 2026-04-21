import React from "react";
import { useIsMobile } from "@zedi/ui";
import Header from "./Header";
import { BottomNav } from "./BottomNav";
import { HeaderActionsProvider } from "@/contexts/HeaderActionsContext";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout: sticky header on top, main content, and a mobile-only
 * bottom navigation. The left sidebar has been removed; functional
 * navigation lives in the header on desktop and in the bottom nav on
 * mobile.
 *
 * 共通レイアウト。上部の固定ヘッダー、メインコンテンツ、モバイル用のボトムナビで構成。
 * 左サイドバーは廃止し、機能ナビゲーションはデスクトップではヘッダー、モバイルでは
 * ボトムナビに集約した。
 */
export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  return (
    <HeaderActionsProvider>
      <div
        className="flex h-svh min-h-0 flex-col overflow-hidden"
        style={
          {
            "--app-header-height": isMobile ? "3.5rem" : "4.5rem",
            "--app-bottom-nav-height": isMobile ? "3.5rem" : "0px",
            "--ai-chat-width": "22rem",
          } as React.CSSProperties
        }
      >
        <Header />
        {/* min-h-0: flex 子が親より伸びてページ全体がスクロールするのを防ぐ。
            BottomNav は fixed で `<main>` の下端に被さる。ラッパーで
            padding-bottom を確保するとスクロール領域が BottomNav の上端で
            切り詰められ、backdrop-blur の下にコンテンツが流れ込まない。
            スクロール範囲はビューポート下端まで伸ばし、最終行が nav に
            常時隠れないよう `<main>` 側に padding-bottom を持たせる。
            `<main>` is the scroll container; keep its scroll range running
            all the way to the viewport bottom so content passes under the
            translucent BottomNav and gets blurred. Put the bottom-nav +
            safe-area padding on `<main>` itself so the last line still
            settles above the nav instead of being clipped behind it. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
            style={
              isMobile
                ? {
                    paddingBottom:
                      "calc(var(--app-bottom-nav-height, 3.5rem) + env(safe-area-inset-bottom))",
                  }
                : undefined
            }
          >
            {children}
          </main>
        </div>
        {isMobile && <BottomNav />}
      </div>
    </HeaderActionsProvider>
  );
}
