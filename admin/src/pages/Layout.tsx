import { Outlet, Link, useLocation } from "react-router-dom";
import {
  Bot,
  Users,
  ScrollText,
  HeartPulse,
  Activity,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Badge,
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
import { useApiErrorActiveCount } from "./errors/useApiErrorActiveCount";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** バッジ表示用の件数を返す hook（任意） / Optional hook returning the badge count */
  useBadgeCount?: () => number;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/ai-models", labelKey: "nav.items.aiModels", icon: Bot },
  { to: "/users", labelKey: "nav.items.users", icon: Users },
  { to: "/audit-logs", labelKey: "nav.items.auditLogs", icon: ScrollText },
  { to: "/wiki-health", labelKey: "nav.items.wikiHealth", icon: HeartPulse },
  { to: "/activity-log", labelKey: "nav.items.activityLog", icon: Activity },
  {
    to: "/errors",
    labelKey: "nav.items.errors",
    icon: AlertTriangle,
    useBadgeCount: useApiErrorActiveCount,
  },
];

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
}

/**
 * サイドバー 1 項目分のリンク。`useBadgeCount` 指定時はバッジを描画する。
 * Hook ルールを守るために `NavItem` を 1:1 に展開するコンポーネントとして切り出す。
 *
 * Renders a single sidebar link, optionally with a numeric badge. Split out so
 * the per-item Hook (`useBadgeCount`) is called from a stable component
 * position rather than inside `NAV_ITEMS.map`.
 */
function NavLink({ item, isActive }: NavLinkProps) {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const Icon = item.icon;
  // `useBadgeCount` は描画位置で固定されているため、Rules of Hooks に違反しない。
  // The hook is called from a fixed component position, so Rules of Hooks holds.
  const badgeCount = item.useBadgeCount?.() ?? 0;
  const showBadge = item.useBadgeCount != null && badgeCount > 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link to={item.to}>
          <Icon />
          <span>{label}</span>
          {showBadge && (
            <Badge
              variant="destructive"
              className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px] tabular-nums"
              aria-label={t("nav.unreadBadgeAriaLabel", { count: badgeCount })}
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

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
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    location.pathname === item.to ||
                    (item.to !== "/" && location.pathname.startsWith(item.to));
                  return <NavLink key={item.to} item={item} isActive={isActive} />;
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
