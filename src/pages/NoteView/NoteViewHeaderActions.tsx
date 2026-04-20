import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Note } from "@/types/note";
import type { NotePageSummary } from "./noteViewHelpers";
import { NoteViewAddPageDialogContent } from "./NoteViewAddPageDialogContent";
import { ShareButton } from "./ShareModal/ShareButton";

/**
 * ノート画面ヘッダーの操作群に必要な Props。共有・設定・ページ追加の各エントリーポイントを受け渡す。
 * Props required by the note-view header action cluster; wires up the share,
 * settings, and add-page entry points shown alongside the note title.
 */
export interface NoteViewHeaderActionsProps {
  /** ノート本体。ShareModal に初期状態を渡すのに使う。 / The note; passed into the share modal for its initial state. */
  note: Note;
  /** メンバー管理 UI の表示可否（owner のみ true）。 / Whether the current user can manage members (owner only). */
  canManageMembers: boolean;
  /** ログイン済みフラグ。未ログインでも閲覧できるノートで分岐するため。 / Whether the viewer is signed in. */
  isSignedIn: boolean;
  /** ノート閲覧権限。 / Whether the viewer can read the note. */
  canView: boolean;
  /** ページ追加 UI を表示するかどうか。 / Whether the add-page control should be shown. */
  canShowAddPage: boolean;
  /** ページ追加ダイアログの open 状態。 / Controlled open state for the add-page dialog. */
  isAddPageOpen: boolean;
  setIsAddPageOpen: (v: boolean) => void;
  /** 新規ページのタイトル入力状態。 / New page title input value. */
  newPageTitle: string;
  setNewPageTitle: (v: string) => void;
  /** 既存ページ検索クエリ。 / Search query for existing pages to add. */
  pageFilter: string;
  setPageFilter: (v: string) => void;
  /** 検索でヒットした追加候補ページ。 / Pages that matched the current search query. */
  filteredPages: NotePageSummary[];
  /** ノートを編集できるか。 / Whether the viewer can edit the note. */
  canEdit: boolean;
  /** 新規タイトルでページを追加するハンドラ。 / Handler to add a new page by title. */
  onAddByTitle: () => Promise<void>;
  /** 既存ページ ID でページを追加するハンドラ。 / Handler to attach an existing page by id. */
  onAddByPageId: (pageId: string) => Promise<void>;
  /** ページ追加の mutation が進行中か。 / Whether the add-page mutation is in flight. */
  addPagePending: boolean;
}

/**
 * ノート画面ヘッダーの操作群（共有 / 設定 / ページ追加）。
 * Action cluster rendered in the note-view header: share button, settings
 * link (owner-only), and the add-page dialog launcher.
 */
export function NoteViewHeaderActions({
  note,
  canManageMembers,
  isSignedIn,
  canView,
  canShowAddPage,
  isAddPageOpen,
  setIsAddPageOpen,
  newPageTitle,
  setNewPageTitle,
  pageFilter,
  setPageFilter,
  filteredPages,
  canEdit,
  onAddByTitle,
  onAddByPageId,
  addPagePending,
}: NoteViewHeaderActionsProps) {
  /**
   *
   */
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {canManageMembers && (
        <>
          <ShareButton note={note} canManageMembers={canManageMembers} />
          <Button asChild variant="outline" size="sm">
            <Link to={`/note/${note.id}/settings`}>{t("notes.settings")}</Link>
          </Button>
        </>
      )}
      {!isSignedIn && canView && (
        <span className="text-muted-foreground text-sm">{t("notes.loginToPost")}</span>
      )}
      {canShowAddPage && (
        <Dialog open={isAddPageOpen} onOpenChange={setIsAddPageOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              {t("notes.addPage")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NoteViewAddPageDialogContent
              newPageTitle={newPageTitle}
              setNewPageTitle={setNewPageTitle}
              pageFilter={pageFilter}
              setPageFilter={setPageFilter}
              filteredPages={filteredPages}
              canEdit={canEdit}
              onAddByTitle={onAddByTitle}
              onAddByPageId={onAddByPageId}
              isPending={addPagePending}
              onClose={() => setIsAddPageOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
