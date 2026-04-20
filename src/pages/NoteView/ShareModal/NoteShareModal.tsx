import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@zedi/ui";
import type { Note } from "@/types/note";
import { NoteInviteLinksSection } from "@/pages/NoteMembers/NoteInviteLinksSection";
import { ShareModalMembersTab } from "./ShareModalMembersTab";
import { ShareModalVisibilityTab } from "./ShareModalVisibilityTab";

/**
 * 共有モーダルの Props。
 * Props for the share modal.
 */
export interface NoteShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note;
  /**
   * Phase 6 (#663) のドメイン許可タブを表示するかどうか。未実装のときは `false` を指定してタブを隠す。
   * Whether to show the Phase 6 (#663) domain-allowlist tab. Pass `false` (the
   * default) to hide it until that phase ships.
   */
  showDomainsTab?: boolean;
}

/**
 * ノート共有モーダル。メンバー招待・共有リンク・公開設定を 1 つのダイアログに集約する。
 * Consolidated share modal for a note: members, share links, and visibility
 * (domains tab is reserved for Phase 6 and hidden by default).
 *
 * このモーダルはオーナー向け UI のみサポートする。エディタ向けの読み取り専用
 * 表示は別 Issue のフォローアップで追加する。
 *
 * Only supports the owner UI for now; editor-facing read-only tabs will arrive
 * in a follow-up issue.
 */
export function NoteShareModal({
  open,
  onOpenChange,
  note,
  showDomainsTab = false,
}: NoteShareModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("notes.shareModalTitle")}</DialogTitle>
          <DialogDescription>{t("notes.shareModalDescription")}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList>
            <TabsTrigger value="members">{t("notes.shareTabMembers")}</TabsTrigger>
            <TabsTrigger value="links">{t("notes.shareTabLinks")}</TabsTrigger>
            {showDomainsTab ? (
              <TabsTrigger value="domains">{t("notes.shareTabDomains")}</TabsTrigger>
            ) : null}
            <TabsTrigger value="visibility">{t("notes.shareTabVisibility")}</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <ShareModalMembersTab
              noteId={note.id}
              enabled={open}
              onNavigate={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="links">
            <NoteInviteLinksSection noteId={note.id} />
          </TabsContent>

          <TabsContent value="visibility">
            <ShareModalVisibilityTab note={note} canEdit />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
