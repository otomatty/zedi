import React from "react";
import { useIsMobile } from "@zedi/ui";
import Header from "./Header";
import { AIChatDock } from "./AIChatDock";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout: sticky header on top, main content, right-side AI dock
 * (desktop only) and a mobile-only bottom navigation. The left sidebar has
 * been removed; functional navigation lives in the header on desktop and
 * in the bottom nav on mobile.
 *
 * 共通レイアウト。上部の固定ヘッダー、メインコンテンツ、右側 AI ドック
 * （デスクトップのみ）、モバイル用のボトムナビで構成。左サイドバーは廃止し、
 * 機能ナビゲーションはデスクトップではヘッダー、モバイルではボトムナビに集約した。
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
      {/* min-h-0: flex 子が親より伸びてページ全体がスクロールするのを防ぐ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
        {!isMobile && <AIChatDock />}
      </div>
      {isMobile && <BottomNav />}
    </div>
  );
}
