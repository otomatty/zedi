import { Link, useLocation } from "react-router-dom";
import { Home, FileText, Settings, CreditCard } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { SignedIn, useUser } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";

const navItems = [
  { path: "/home", icon: Home, i18nKey: "nav.home" as const },
  { path: "/notes", icon: FileText, i18nKey: "nav.notes" as const },
  { path: "/settings", icon: Settings, i18nKey: "nav.settings" as const },
  { path: "/pricing", icon: CreditCard, i18nKey: "nav.plan" as const },
];

/**
 * App sidebar with navigation (Home, Notes, Settings, Plan).
 * Used inside SidebarProvider within AppLayout.
 * アプリ用サイドバー。Home / Notes / Settings / Plan のナビゲーションを表示。
 */
export function AppSidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useUser();
  const { displayName, avatarUrl } = useProfile();

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="top-[var(--app-header-height)] h-[calc(100svh-var(--app-header-height))]"
    >
      <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
        <Link
          to="/home"
          className="focus-visible:ring-ring rounded-md focus:outline-none focus-visible:ring-2"
        >
          <span className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-lg font-bold tracking-tight text-transparent">
            Zedi
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.menu", "Menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ path, icon: Icon, i18nKey }) => {
                const isActive =
                  location.pathname === path ||
                  (path !== "/home" && location.pathname.startsWith(path));
                return (
                  <SidebarMenuItem key={path}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={t(i18nKey)}>
                      <Link to={path}>
                        <Icon data-icon="inline-start" />
                        <span>{t(i18nKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SignedIn>
        <SidebarFooter className="border-sidebar-border border-t p-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Avatar className="size-8 shrink-0">
              <AvatarImage
                src={avatarUrl || user?.imageUrl}
                alt={displayName || user?.fullName || "User"}
              />
              <AvatarFallback>{(displayName || user?.firstName)?.charAt(0) ?? "U"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 truncate text-xs">
              <span className="text-sidebar-foreground block font-medium">
                {displayName || user?.fullName || "—"}
              </span>
            </div>
          </div>
        </SidebarFooter>
      </SignedIn>
    </Sidebar>
  );
}
