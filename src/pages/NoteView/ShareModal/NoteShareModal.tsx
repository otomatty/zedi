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
import { ShareModalDomainTab } from "./ShareModalDomainTab";
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
   * ドメイン招待タブ (Phase 6 / #663) を表示するか。既定で表示する。
   * 必要に応じて `false` を渡せば非表示にできる（テスト用途・特殊フロー想定）。
   *
   * Whether to show the domain-access tab (Phase 6 / issue #663). Defaults to
   * `true` now that the feature has shipped; pass `false` to hide it for
   * specific flows (e.g. tests, edge-case UIs).
   */
  showDomainsTab?: boolean;
}

/**
 * ノート共有モーダル。メンバー招待・共有リンク・ドメイン招待・公開設定を 1 つのダイアログに集約する。
 * Consolidated share modal for a note: members, share links, domain access,
 * and visibility.
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
  showDomainsTab = true,
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
            <NoteInviteLinksSection noteId={note.id} editPermission={note.editPermission} />
          </TabsContent>

          {showDomainsTab ? (
            <TabsContent value="domains">
              <ShareModalDomainTab noteId={note.id} enabled={open} />
            </TabsContent>
          ) : null}

          <TabsContent value="visibility">
            <ShareModalVisibilityTab note={note} canEdit />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
