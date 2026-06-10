import React, { useMemo } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { NoteTitleSwitcher } from "@/components/note/NoteTitleSwitcher";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Button } from "@zedi/ui";
import { useNote } from "@/hooks/notes/useNoteQueries";
import { useTranslation } from "react-i18next";
import { NoteSettingsContext, type NoteSettingsContextValue } from "./NoteSettingsContext";
import { NoteSettingsSidebar } from "./NoteSettingsSidebar";

/**
 * `NoteSettings` は `/notes/:noteId/settings` のレイアウトコンポーネント。
 *
 * - 共通領域: ヘッダー（タイトル + 公開バッジ + 「ノートへ戻る」）+ サイドナビ
 * - 各セクションは `<Outlet />` 経由で描画され、`NoteSettingsContext` から
 *   `note` / `access` / `role` / `canManage` を受け取る（再フェッチを避ける）
 * - 権限ゲート:
 *   - 未ログイン / `canView=false` → no-access プレースホルダ
 *   - `viewer` 以外で remote source（共有モーダル経由の閲覧）も同様に no-access
 *
 * Layout for `/notes/:noteId/settings/*`. Owns the shared header + sidebar
 * shell; each subroute renders its own `<Outlet />` content. Permissions are
 * resolved once here and propagated via `NoteSettingsContext` so sections
 * stay thin.
 */
const NoteSettings: React.FC = () => {
  const { t } = useTranslation();
  const { noteId } = useParams<{ noteId: string }>();
  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const isLocal = source === "local";

  const contextValue = useMemo<NoteSettingsContextValue | null>(() => {
    if (!note || !access) return null;
    const canManage = Boolean(access.canManageMembers && isLocal);
    const canViewAsEditor = Boolean(access.role === "editor" && access.canView && isLocal);
    return {
      note,
      access,
      role: access.role,
      canManage,
      canViewAsEditor,
    };
  }, [note, access, isLocal]);

  if (isNoteLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }

  if (!note || !access?.canView || !contextValue) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("notes.noteNotFoundOrNoAccess")}</p>
      </PageLoadingOrDenied>
    );
  }

  // サイドナビが扱えるロールに正規化する。`guest`/`none` は viewer 相当に
  // 落として、最低限 visibility セクションを read-only で閲覧可能にする。
  // Normalize to a role the sidebar understands. `guest` / `none` fall back to
  // `viewer` so the visibility section can still be reviewed read-only.
  const sidebarRole: "owner" | "editor" | "viewer" =
    contextValue.role === "owner"
      ? "owner"
      : contextValue.role === "editor" && contextValue.canViewAsEditor
        ? "editor"
        : "viewer";

  return (
    <NoteSettingsContext.Provider value={contextValue}>
      <div className="min-h-0 flex-1 py-4 sm:py-6 md:py-8">
        <Container>
          <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
            {/* タイトル → ノート切替 → 公開バッジ。狭い画面では折り返し、
                「ノートへ戻る」は全幅ボタンにしてタップしやすくする。
                Title row wraps on narrow viewports; the back link becomes a
                full-width button on mobile for a larger tap target. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold whitespace-nowrap sm:text-xl">
                {t("notes.noteSettings")}
              </h1>
              <NoteTitleSwitcher noteId={note.id} noteTitle={note.title} variant="subtitle" />
              <NoteVisibilityBadge visibility={note.visibility} />
            </div>
            <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
              <Link to={`/notes/${note.id}`}>{t("notes.backToNote")}</Link>
            </Button>
          </header>

          <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 md:grid-cols-[minmax(0,12rem)_1fr] md:gap-8 lg:grid-cols-[minmax(0,13.5rem)_1fr]">
            <aside className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 -mx-4 border-b px-4 pb-2 backdrop-blur-sm sm:-mx-6 sm:px-6 md:top-24 md:z-auto md:mx-0 md:self-start md:border-b-0 md:bg-transparent md:px-0 md:pb-0 md:backdrop-blur-none">
              <NoteSettingsSidebar noteId={note.id} sidebarRole={sidebarRole} />
            </aside>
            <main className="min-w-0">
              <Outlet />
            </main>
          </div>
        </Container>
      </div>
    </NoteSettingsContext.Provider>
  );
};

export default NoteSettings;
