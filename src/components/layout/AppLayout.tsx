import React from "react";
import Header from "./Header";
import { AIChatDock } from "./AIChatDock";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout: sticky header on top, main content, and right-side AI dock.
 * The left sidebar has been removed; functional navigation lives in the header.
 *
 * 共通レイアウト。上部の固定ヘッダー、メインコンテンツ、右側 AI ドックで構成。
 * 左サイドバーは廃止し、機能ナビゲーションはヘッダー内に集約した。
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div
      className="flex h-svh min-h-0 flex-col overflow-hidden"
      style={
        {
          "--app-header-height": "4.5rem",
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
        <AIChatDock />
      </div>
    </div>
  );
}
