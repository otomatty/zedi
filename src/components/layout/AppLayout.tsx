import React from "react";
import { useIsMobile } from "@zedi/ui";
import Header from "./Header";
import { BottomNav } from "./BottomNav";

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
    <div
      className="flex h-svh min-h-0 flex-col overflow-hidden"
      style={
        {
          "--app-header-height": isMobile ? "3rem" : "4.5rem",
          "--app-bottom-nav-height": isMobile ? "3.5rem" : "0px",
          "--ai-chat-width": "22rem",
        } as React.CSSProperties
      }
    >
      <Header />
      {/* min-h-0: flex 子が親より伸びてページ全体がスクロールするのを防ぐ。
          モバイルでは BottomNav が fixed で main の下端に被さるため、
          padding-bottom で BottomNav 分（safe-area 含む）の余白を確保する。
          On mobile, BottomNav is `position: fixed` and overlays the bottom of
          `<main>`, so reserve that height (plus the safe-area inset) as
          padding-bottom to keep page content scrollable past the nav. */}
      <div
        className="flex min-h-0 flex-1 overflow-hidden"
        style={
          isMobile
            ? {
                paddingBottom:
                  "calc(var(--app-bottom-nav-height, 3.5rem) + env(safe-area-inset-bottom))",
              }
            : undefined
        }
      >
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
      {isMobile && <BottomNav />}
    </div>
  );
}
