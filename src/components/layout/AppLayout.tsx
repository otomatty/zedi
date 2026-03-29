import React from "react";
import { SidebarProvider, SidebarInset } from "@zedi/ui";
import { AppSidebar } from "./AppSidebar";
import Header from "./Header";
import { AIChatDock } from "./AIChatDock";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout with sidebar and header (`--sidebar-width` from SidebarProvider).
 * Header is fixed at full width above the sidebar; sidebar opens below the header.
 * ヘッダーは全幅で固定、サイドバーはヘッダーの下で開閉する共通レイアウト。
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={false}
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
        <AppSidebar />
        <SidebarInset className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {children}
        </SidebarInset>
        <AIChatDock />
      </div>
    </SidebarProvider>
  );
}
