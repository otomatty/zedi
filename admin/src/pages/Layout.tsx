import { Outlet, Link, useLocation } from "react-router-dom";
import { Bot, Users } from "lucide-react";
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

const navLinks = [
  { to: "/ai-models", label: "AI モデル", icon: Bot },
  { to: "/users", label: "ユーザー管理", icon: Users },
];

export default function Layout() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Zedi 管理画面</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>メニュー</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navLinks.map(({ to, label, icon: Icon }) => {
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
          <span className="text-sm font-medium">管理画面</span>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
