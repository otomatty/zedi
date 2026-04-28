import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Note, NoteAccessRole } from "@/types/note";
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
  /**
   * 現在ユーザーのノート上のロール。タブの表示可否・read-only モードを切り替える。
   * - owner: 全タブ + 編集可
   * - editor: 全タブ表示 + 全タブ read-only（誰がアクセス可能か透明性のため）
   * - viewer: 公開設定タブのみ表示（read-only）。メンバー / リンク / ドメインは
   *   プライバシー配慮のため非表示
   * - guest / none: そもそも ShareButton 側で出さない想定だが、フォールバックで
   *   viewer と同等の最小表示にする
   *
   * 既定値は最小権限の `"none"`。呼び出し側でロールを明示的に渡し損ねた場合に
   * オーナー UI を露出させないためのフェイルセーフ (#794 review)。
   *
   * Current user's role on the note. Drives tab visibility + read-only state.
   * Defaults to least-privilege `"none"` so a caller that forgets to pass a
   * role can never accidentally surface owner-only edit controls (#794 review).
   */
  userRole?: NoteAccessRole;
}

/**
 * `userRole` から各タブの可視性・編集可否を導出する。
 * Derive per-tab visibility + edit-state from the current user's role.
 */
function getTabPermissions(role: NoteAccessRole): {
  canEdit: boolean;
  showMembers: boolean;
  showLinks: boolean;
  showDomains: boolean;
  showVisibility: boolean;
} {
  if (role === "owner") {
    return {
      canEdit: true,
      showMembers: true,
      showLinks: true,
      showDomains: true,
      showVisibility: true,
    };
  }
  if (role === "editor") {
    return {
      canEdit: false,
      showMembers: true,
      showLinks: true,
      showDomains: true,
      showVisibility: true,
    };
  }
  // viewer / guest / none — 公開設定 read-only のみ
  // viewer / guest / none — visibility tab only, read-only
  return {
    canEdit: false,
    showMembers: false,
    showLinks: false,
    showDomains: false,
    showVisibility: true,
  };
}

type ShareModalTab = "members" | "links" | "domains" | "visibility";

/**
 * ノート共有モーダル。メンバー招待・共有リンク・ドメイン招待・公開設定を 1 つのダイアログに集約する。
 * `userRole` でタブ表示と read-only モードを出し分ける（owner=編集可、editor=全タブ
 * read-only、viewer=公開設定のみ read-only）。
 *
 * Consolidated share modal for a note: members, share links, domain access,
 * and visibility. `userRole` gates which tabs are visible and toggles read-only
 * mode for non-owners (owner edits everything; editor sees everything as
 * read-only for transparency; viewer only sees the visibility tab).
 */
export function NoteShareModal({
  open,
  onOpenChange,
  note,
  showDomainsTab = true,
  userRole = "none",
}: NoteShareModalProps) {
  const { t } = useTranslation();
  const perms = useMemo(() => getTabPermissions(userRole), [userRole]);

  const showDomains = perms.showDomains && showDomainsTab;

  const getFirstVisibleTab = useCallback((): ShareModalTab => {
    if (perms.showMembers) return "members";
    if (perms.showLinks) return "links";
    if (showDomains) return "domains";
    return "visibility";
  }, [perms.showMembers, perms.showLinks, showDomains]);

  const [activeTab, setActiveTab] = useState<ShareModalTab>(getFirstVisibleTab);

  // タブがロール / showDomainsTab 変化で消えると Tabs が空パネルを保持してしまう。
  // 利用可能な先頭タブにフォールバックする。
  // If the active tab disappears (role change or `showDomainsTab` flip), fall
  // back to the first remaining tab so the panel never goes blank.
  useEffect(() => {
    const isVisible =
      (activeTab === "members" && perms.showMembers) ||
      (activeTab === "links" && perms.showLinks) ||
      (activeTab === "domains" && showDomains) ||
      (activeTab === "visibility" && perms.showVisibility);

    if (!isVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard for vanished tab
      setActiveTab(getFirstVisibleTab());
    }
  }, [
    activeTab,
    getFirstVisibleTab,
    perms.showLinks,
    perms.showMembers,
    perms.showVisibility,
    showDomains,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("notes.shareModalTitle")}</DialogTitle>
          <DialogDescription>{t("notes.shareModalDescription")}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList>
            {perms.showMembers ? (
              <TabsTrigger value="members">{t("notes.shareTabMembers")}</TabsTrigger>
            ) : null}
            {perms.showLinks ? (
              <TabsTrigger value="links">{t("notes.shareTabLinks")}</TabsTrigger>
            ) : null}
            {showDomains ? (
              <TabsTrigger value="domains">{t("notes.shareTabDomains")}</TabsTrigger>
            ) : null}
            {perms.showVisibility ? (
              <TabsTrigger value="visibility">{t("notes.shareTabVisibility")}</TabsTrigger>
            ) : null}
          </TabsList>

          {perms.showMembers ? (
            <TabsContent value="members">
              <ShareModalMembersTab
                noteId={note.id}
                enabled={open}
                onNavigate={() => onOpenChange(false)}
                readOnly={!perms.canEdit}
              />
            </TabsContent>
          ) : null}

          {perms.showLinks ? (
            <TabsContent value="links">
              <NoteInviteLinksSection
                noteId={note.id}
                editPermission={note.editPermission}
                readOnly={!perms.canEdit}
              />
            </TabsContent>
          ) : null}

          {showDomains ? (
            <TabsContent value="domains">
              <ShareModalDomainTab noteId={note.id} enabled={open} readOnly={!perms.canEdit} />
            </TabsContent>
          ) : null}

          {perms.showVisibility ? (
            <TabsContent value="visibility">
              <ShareModalVisibilityTab note={note} canEdit={perms.canEdit} />
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
