import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, FileText, FileStack, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useNotes } from "@/hooks/useNoteQueries";
import { AppSidebarAiChatSection } from "./AppSidebarAiChatSection";
import { AI_CHAT_BASE_PATH } from "@/constants/aiChatSidebar";

const headerNav = [
  { path: "/home", icon: Home, i18nKey: "nav.home" as const },
  { path: "/notes", icon: FileText, i18nKey: "nav.notes" as const },
  { path: AI_CHAT_BASE_PATH, icon: Sparkles, i18nKey: "nav.ai" as const },
];

/**
 * App sidebar: 2-column header (Home+Notes; AI half-width on row 2); notes + AI chat history in content.
 * AI history is always shown (even on /ai routes without ContentWithAIChat).
 * アプリ用サイドバー。ヘッダーは2カラム（1行目 Home・Notes、2行目は AI を左半分のみ）。本文はノートと AI 履歴を常時表示。
 */
export function AppSidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const { data: notes, isLoading: notesLoading } = useNotes();

  const sortedNotes = useMemo(() => {
    if (!notes?.length) return [];
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes]);

  return (
    <Sidebar
      side="left"
      collapsible="offcanvas"
      className="top-(--app-header-height) h-[calc(100svh-var(--app-header-height))]"
    >
      <SidebarHeader className="border-sidebar-border border-b">
        <SidebarMenu className="grid w-full min-w-0 grid-cols-2 gap-1">
          {headerNav.map(({ path, icon: Icon, i18nKey }) => {
            const isActive =
              path === "/home"
                ? location.pathname === "/home"
                : path === AI_CHAT_BASE_PATH
                  ? location.pathname === AI_CHAT_BASE_PATH ||
                    location.pathname.startsWith(`${AI_CHAT_BASE_PATH}/`)
                  : location.pathname === path || location.pathname.startsWith(`${path}/`);
            return (
              <SidebarMenuItem key={path} className="min-w-0">
                <SidebarMenuButton asChild isActive={isActive} tooltip={t(i18nKey)} size="sm">
                  <Link to={path} className="min-w-0 justify-center gap-1.5">
                    <Icon className="size-4 shrink-0" data-icon="inline-start" />
                    <span className="truncate">{t(i18nKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <FileStack className="size-3.5 shrink-0" aria-hidden />
            {t("nav.sidebarMyNotes", "Your notes")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!isSignedIn && (
                <p className="text-muted-foreground px-2 py-1.5 text-xs leading-snug">
                  {t("nav.sidebarSignInForNotes", "Sign in to see your notes")}
                </p>
              )}
              {isSignedIn && notesLoading && (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  {t("nav.sidebarNotesLoading", "Loading…")}
                </p>
              )}
              {isSignedIn && !notesLoading && sortedNotes.length === 0 && (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  {t("nav.sidebarNoNotes", "No notes yet")}
                </p>
              )}
              {isSignedIn &&
                !notesLoading &&
                sortedNotes.map((note) => {
                  const to = `/note/${note.id}`;
                  const isActive =
                    location.pathname === to || location.pathname.startsWith(`/note/${note.id}/`);
                  const title =
                    note.title.trim().length > 0
                      ? note.title
                      : t("notes.untitledNote", "Untitled note");
                  return (
                    <SidebarMenuItem key={note.id}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={title} size="sm">
                        <Link to={to} className="min-w-0">
                          <FileText className="size-4 shrink-0" />
                          <span className="truncate">{title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <AppSidebarAiChatSection />
      </SidebarContent>
    </Sidebar>
  );
}
