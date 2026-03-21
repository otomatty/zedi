import React from "react";
import { SidebarProvider, SidebarInset } from "@zedi/ui";
import { AppSidebar } from "./AppSidebar";
import Header from "./Header";
import { AIChatDock } from "./AIChatDock";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared layout with sidebar and header (sidebar-16 pattern).
 * Header is fixed at full width above the sidebar; sidebar opens below the header.
 * ヘッダーは全幅で固定、サイドバーはヘッダーの下で開閉する共通レイアウト。
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider
      defaultOpen={false}
      className="flex flex-col"
      style={
        {
          "--app-header-height": "4.5rem",
          "--ai-chat-width": "22rem",
        } as React.CSSProperties
      }
    >
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <div className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</div>
        </SidebarInset>
        <AIChatDock />
      </div>
    </SidebarProvider>
  );
}
