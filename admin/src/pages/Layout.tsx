import { Outlet, Link, useLocation } from "react-router-dom";
import { Bot, Users, ScrollText, HeartPulse, Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarHeader,
} from "@zedi/ui";

const NAV_ITEMS = [
  { to: "/ai-models", labelKey: "nav.items.aiModels", icon: Bot },
  { to: "/users", labelKey: "nav.items.users", icon: Users },
  { to: "/audit-logs", labelKey: "nav.items.auditLogs", icon: ScrollText },
  { to: "/wiki-health", labelKey: "nav.items.wikiHealth", icon: HeartPulse },
  { to: "/activity-log", labelKey: "nav.items.activityLog", icon: Activity },
];

/**
 * 管理画面のレイアウト（サイドバー付き）。
 * Admin layout with sidebar navigation.
 */
export default function Layout() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">{t("nav.adminPanelTitle")}</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => {
                  const label = t(labelKey);
                  const isActive =
                    location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                        <Link to={to}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">{t("nav.adminShortTitle")}</span>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
