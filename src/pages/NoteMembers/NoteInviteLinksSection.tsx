/**
 * 共有リンク（invite-links）管理セクション — Phase 5 (viewer / editor 対応)。
 *
 * - 発行: ロール (viewer / editor) / 有効期限 (1/7/30/最大 90 日) / 利用上限 (1..100 / 無制限) / ラベル
 * - editor を選んだ瞬間に確認モーダルを出し、OK したときだけ発行ボタンを押せる
 * - 一覧: 取り消し済みを除外して表示（API が `isNull(revoked_at)` でフィルタ）
 * - editor リンクには赤系の `Editor` バッジを強調表示
 * - コピー / 取り消し
 *
 * Share-link management UI. Phase 5 (#662) unlocks editor-role links behind a
 * confirmation modal and highlights them in red so operators can eyeball risky
 * rows at a glance.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Copy, Loader2, Plus, ShieldAlert, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "@zedi/ui";
import {
  useCreateInviteLink,
  useInviteLinksForNote,
  useRevokeInviteLink,
} from "@/hooks/useInviteLinks";
import type { InviteLinkRow } from "@/lib/api/types";
import type { NoteEditPermission } from "@/types/note";

/**
 * 各有効期限プリセットの内部値（ms）。
 * Expiry preset values (in ms). Keep these aligned with the API upper bound
 * of 90 days enforced by `normalizeCreateInviteLinkInput`.
 */
const EXPIRY_PRESETS_MS = {
  d1: 1 * 24 * 60 * 60 * 1000,
  d7: 7 * 24 * 60 * 60 * 1000,
  d30: 30 * 24 * 60 * 60 * 1000,
  d90: 90 * 24 * 60 * 60 * 1000,
} as const;

type ExpiryPreset = keyof typeof EXPIRY_PRESETS_MS;

/**
 * 利用上限プリセット。`unlimited` は API 側で `null` にマップする。
 * Use-limit presets. `unlimited` maps to `null` at the API boundary.
 */
type MaxUsesPreset = "1" | "10" | "50" | "100" | "unlimited";

const MAX_USES_LOOKUP: Record<MaxUsesPreset, number | null> = {
  "1": 1,
  "10": 10,
  "50": 50,
  "100": 100,
  unlimited: null,
};

/**
 * 招待リンクの完全な URL をクライアント側で組み立てる。
 * Build the full redeemable URL from a token on the client.
 */
function buildInviteLinkUrl(token: string): string {
  return `${window.location.origin}/invite-links/${encodeURIComponent(token)}`;
}

/**
 * Copy-to-clipboard with a graceful fallback on older browsers.
 * 古いブラウザでも動くようにクリップボード API をフォールバックする。
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand path.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 発行できるロール。`editor` は確認モーダルの承諾後のみ発行できる (#662)。
 * Roles available for creation; `editor` requires a confirmation-modal ack (#662).
 */
type InviteLinkRoleChoice = "viewer" | "editor";

/**
 * Section props.
 * セクションの Props。
 */
export interface NoteInviteLinksSectionProps {
  noteId: string;
  /** Test-only injection point for "now" so expiry labels are deterministic. */
  now?: () => number;
  /**
   * ノートの編集権限ポリシー。`owner_only` の場合は editor リンクを発行できない
   * （UI でも選択肢を無効化し、誤発行の余地を残さない）。ドメイン型を共有して
   * ドリフトを防ぐ (#676 coderabbit)。
   * Edit permission of the note. When `owner_only`, editor links are disabled
   * in the UI so they match the server-side 400 guard. Reuses the shared
   * `NoteEditPermission` domain type (#676 coderabbit).
   */
  editPermission?: NoteEditPermission;
}

/**
 * 発行フォーム + 一覧を組み合わせたセクション。
 * Create form + list rolled into a single section.
 */
export const NoteInviteLinksSection: React.FC<NoteInviteLinksSectionProps> = ({
  noteId,
  now,
  editPermission,
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: links = [], isLoading } = useInviteLinksForNote(noteId);
  const createMutation = useCreateInviteLink(noteId);
  const revokeMutation = useRevokeInviteLink(noteId);

  const [role, setRole] = useState<InviteLinkRoleChoice>("viewer");
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("d7");
  const [maxUsesPreset, setMaxUsesPreset] = useState<MaxUsesPreset>("10");
  const [label, setLabel] = useState("");
  /**
   * 「editor を選んだ瞬間に確認モーダルを出し、OK で初めて発行ボタンが押せる」
   * という #662 の仕様を満たすためのフラグ。cancel / role 変更で false に戻す。
   *
   * Tracks whether the user has acknowledged the editor-role warning modal.
   * Flipped back to `false` on cancel or when the role is changed away from
   * editor so the warning cannot be bypassed by switching back and forth.
   */
  const [editorAcknowledged, setEditorAcknowledged] = useState(false);
  /** editor を選んだ直後に表示される確認モーダルの open 状態。 */
  const [editorConfirmOpen, setEditorConfirmOpen] = useState(false);
  /**
   * AlertDialog の `onOpenChange` は accept / cancel / outside-click を区別しない。
   * accept ボタン押下時は role を `editor` のまま保持したいので、accept 経由での
   * クローズかどうかを ref で記録し、onOpenChange 側で判定する (#676 codex/coderabbit)。
   *
   * Radix `AlertDialog` collapses accept / cancel / outside-click into a single
   * `onOpenChange(false)` callback, so we can't tell them apart from state. A
   * ref flipped to `true` inside the accept handler lets `onOpenChange`
   * distinguish and skip the cancel-path reset when the user confirmed.
   */
  const acknowledgedJustNowRef = useRef(false);

  const canCreateEditorLink = editPermission !== "owner_only";
  const needsEditorAck = role === "editor" && !editorAcknowledged;

  const handleRoleChange = useCallback(
    (value: string) => {
      const next = value === "editor" ? "editor" : "viewer";
      // owner_only ノートで editor が選ばれた場合は UI 上の SelectItem も disabled
      // だが、キーボード/a11y 経由のバイパス対策として handler 側でも弾く
      // (#676 review gemini の defence-in-depth)。
      // Defence-in-depth: the select item is disabled in owner_only notes, but
      // ignore stray events (keyboard / a11y) at the handler level too.
      if (next === "editor" && !canCreateEditorLink) return;
      setRole(next);
      if (next === "editor") {
        // まだ承諾していない場合のみモーダルを出す。
        // Only pop the modal when the user hasn't already acknowledged.
        setEditorAcknowledged(false);
        setEditorConfirmOpen(true);
      } else {
        acknowledgedJustNowRef.current = false;
        setEditorConfirmOpen(false);
        setEditorAcknowledged(false);
      }
    },
    [canCreateEditorLink],
  );

  const handleEditorConfirmCancel = useCallback(() => {
    // キャンセルしたら viewer に戻して、未承諾のまま editor 発行できないようにする。
    // Revert to viewer on cancel so an unacknowledged editor link can never be
    // submitted.
    acknowledgedJustNowRef.current = false;
    setEditorConfirmOpen(false);
    setEditorAcknowledged(false);
    setRole("viewer");
  }, []);

  const handleEditorConfirmAccept = useCallback(() => {
    // ref 経由で「このクローズは accept 由来」であることを onOpenChange に伝える
    // (#676 review: accept 後に直後の onOpenChange(false) が cancel を呼んでしまい
    //  role が viewer に戻る問題の修正)。
    // Flag the next close as accept-initiated so the generic onOpenChange
    // handler does not fall through to the cancel path and reset the role.
    acknowledgedJustNowRef.current = true;
    setEditorAcknowledged(true);
    setEditorConfirmOpen(false);
  }, []);

  const handleEditorDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      if (acknowledgedJustNowRef.current) {
        // 直近の close は accept 由来。cancel のリセットは走らせない。
        // Close caused by accept — swallow and do not reset.
        acknowledgedJustNowRef.current = false;
        setEditorConfirmOpen(false);
        return;
      }
      handleEditorConfirmCancel();
    },
    [handleEditorConfirmCancel],
  );

  const handleCreate = useCallback(async () => {
    // 送信時ガード: 発行フォームが editor に留まったまま editPermission が
    // `owner_only` に変わった場合でも UI でフェイルファストし、サーバーからの
    // 400 に依存しない (#676 coderabbit)。想定外の状態遷移を検知するため、
    // viewer に戻して次の発行を安全側にする。
    //
    // Submit-time guard: fail fast in the UI if `editPermission` was changed
    // to `owner_only` while `role === 'editor'` was already selected, rather
    // than relying on the backend 400 (#676 coderabbit). Reset to viewer so
    // the next submit starts from a safe state.
    if (role === "editor" && !canCreateEditorLink) {
      toast({
        title: t("notes.inviteLinksEditorUnavailableOwnerOnly"),
        variant: "destructive",
      });
      acknowledgedJustNowRef.current = false;
      setRole("viewer");
      setEditorAcknowledged(false);
      return;
    }
    if (needsEditorAck) {
      // 万一 disabled 状態をバイパスされても、送信は確実にブロックする。
      // Defence-in-depth: never submit without the acknowledgement.
      setEditorConfirmOpen(true);
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        role,
        expiresInMs: EXPIRY_PRESETS_MS[expiryPreset],
        maxUses: MAX_USES_LOOKUP[maxUsesPreset],
        label: label.trim() || null,
        requireSignIn: true,
      });
      const url = buildInviteLinkUrl(created.token);
      const copied = await copyToClipboard(url);
      toast({
        title: copied ? t("notes.inviteLinkCreatedAndCopied") : t("notes.inviteLinkCreated"),
        description: url,
      });
      setLabel("");
      // 発行後は viewer に戻して editor の再発行は都度確認を要するようにする。
      // Reset to viewer after a successful create so each editor issuance must
      // be re-acknowledged.
      acknowledgedJustNowRef.current = false;
      setRole("viewer");
      setEditorAcknowledged(false);
    } catch (err) {
      console.error("Failed to create invite link:", err);
      toast({
        title: t("notes.inviteLinkCreateFailed"),
        variant: "destructive",
      });
    }
  }, [
    createMutation,
    expiryPreset,
    maxUsesPreset,
    label,
    toast,
    t,
    role,
    needsEditorAck,
    canCreateEditorLink,
  ]);

  const handleCopy = useCallback(
    async (token: string) => {
      const url = buildInviteLinkUrl(token);
      const ok = await copyToClipboard(url);
      toast({
        title: ok ? t("notes.inviteLinkCopied") : t("notes.inviteLinkCopyFailed"),
        description: url,
        variant: ok ? undefined : "destructive",
      });
    },
    [toast, t],
  );

  const handleRevoke = useCallback(
    async (linkId: string) => {
      try {
        await revokeMutation.mutateAsync({ linkId });
        toast({ title: t("notes.inviteLinkRevoked") });
      } catch (err) {
        console.error("Failed to revoke invite link:", err);
        toast({
          title: t("notes.inviteLinkRevokeFailed"),
          variant: "destructive",
        });
      }
    },
    [revokeMutation, toast, t],
  );

  const nowMs = (now ?? Date.now)();

  return (
    <section className="border-border/60 mt-6 rounded-lg border p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("notes.inviteLinksTitle")}</h2>
      <p className="text-muted-foreground mb-4 text-xs">{t("notes.inviteLinksPhase5Hint")}</p>

      <div className="grid gap-3 md:grid-cols-[1fr_140px_160px_160px_auto]">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("notes.inviteLinksLabelPlaceholder")}
          aria-label={t("notes.inviteLinksLabelAria")}
        />
        <Select value={role} onValueChange={handleRoleChange}>
          <SelectTrigger aria-label={t("notes.inviteLinksRoleAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">{t("notes.inviteLinksRoleViewer")}</SelectItem>
            <SelectItem value="editor" disabled={!canCreateEditorLink}>
              {t("notes.inviteLinksRoleEditor")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={expiryPreset} onValueChange={(v) => setExpiryPreset(v as ExpiryPreset)}>
          <SelectTrigger aria-label={t("notes.inviteLinksExpiryAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="d1">{t("notes.inviteLinksExpiry1d")}</SelectItem>
            <SelectItem value="d7">{t("notes.inviteLinksExpiry7d")}</SelectItem>
            <SelectItem value="d30">{t("notes.inviteLinksExpiry30d")}</SelectItem>
            <SelectItem value="d90">{t("notes.inviteLinksExpiry90d")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={maxUsesPreset} onValueChange={(v) => setMaxUsesPreset(v as MaxUsesPreset)}>
          <SelectTrigger aria-label={t("notes.inviteLinksMaxUsesAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t("notes.inviteLinksMaxUsesN", { count: 1 })}</SelectItem>
            <SelectItem value="10">{t("notes.inviteLinksMaxUsesN", { count: 10 })}</SelectItem>
            <SelectItem value="50">{t("notes.inviteLinksMaxUsesN", { count: 50 })}</SelectItem>
            <SelectItem value="100">{t("notes.inviteLinksMaxUsesN", { count: 100 })}</SelectItem>
            <SelectItem value="unlimited">{t("notes.inviteLinksMaxUsesUnlimited")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending || needsEditorAck}
          className="gap-1"
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t("notes.inviteLinksCreateCta")}
        </Button>
      </div>

      {role === "editor" && !canCreateEditorLink ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {t("notes.inviteLinksEditorUnavailableOwnerOnly")}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        ) : links.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.inviteLinksEmptyState")}</p>
        ) : (
          links.map((link) => (
            <InviteLinkRowView
              key={link.id}
              link={link}
              nowMs={nowMs}
              onCopy={() => handleCopy(link.token)}
              onRevoke={() => handleRevoke(link.id)}
              revoking={revokeMutation.isPending}
            />
          ))
        )}
      </div>

      <AlertDialog open={editorConfirmOpen} onOpenChange={handleEditorDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              {t("notes.inviteLinksEditorConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("notes.inviteLinksEditorConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* AlertDialogCancel 内部のクローズが onOpenChange(false) を発火させ、
                そこから handleEditorConfirmCancel に合流する。ここで onClick を
                重ねると 2 回走るので付けない (#676 coderabbit)。
                The cancel button's close already routes through onOpenChange;
                avoid a redundant onClick that would fire the cancel handler twice. */}
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditorConfirmAccept}>
              {t("notes.inviteLinksEditorConfirmAcknowledge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

interface InviteLinkRowViewProps {
  link: InviteLinkRow;
  nowMs: number;
  onCopy: () => void;
  onRevoke: () => void;
  revoking: boolean;
}

const InviteLinkRowView: React.FC<InviteLinkRowViewProps> = ({
  link,
  nowMs,
  onCopy,
  onRevoke,
  revoking,
}) => {
  const { t } = useTranslation();
  const expiresMs = new Date(link.expires_at).getTime();
  const isExpired = expiresMs <= nowMs;
  const exhausted = link.max_uses !== null && link.used_count >= link.max_uses;

  const statusBadge = useMemo(() => {
    if (isExpired) {
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          {t("notes.inviteLinksStatusExpired")}
        </Badge>
      );
    }
    if (exhausted) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          {t("notes.inviteLinksStatusExhausted")}
        </Badge>
      );
    }
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        {t("notes.inviteLinksStatusActive")}
      </Badge>
    );
  }, [isExpired, exhausted, t]);

  const usageLabel =
    link.max_uses === null
      ? t("notes.inviteLinksUsageUnlimited", { used: link.used_count })
      : t("notes.inviteLinksUsage", {
          used: link.used_count,
          max: link.max_uses,
        });

  const expiresLabel = t("notes.inviteLinksExpiresAt", {
    date: new Date(link.expires_at).toLocaleString(),
  });

  // editor リンクは赤系の強調バッジを別に出して、発行済み editor リンクを一覧で
  // すぐ見分けられるようにする (#662)。viewer リンクは従来通りラベルのみ。
  //
  // Editor links get a dedicated red "Editor" badge so operators can spot risky
  // rows at a glance (#662). Viewer links keep the inline text label.
  const roleLabel =
    link.role === "editor" ? (
      <Badge
        className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
        aria-label={t("notes.inviteLinksRoleEditorBadgeAria")}
      >
        {t("notes.inviteLinksRoleEditorBadge")}
      </Badge>
    ) : (
      <span className="text-muted-foreground text-xs">{t("notes.inviteLinksRoleViewer")}</span>
    );

  return (
    <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b pb-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{link.label ?? t("notes.inviteLinksUnnamed")}</span>
          {statusBadge}
          {roleLabel}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {usageLabel} · {expiresLabel}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("notes.inviteLinksCopyAria")}
          title={t("notes.inviteLinksCopy")}
          onClick={onCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("notes.inviteLinksRevokeAria")}
          title={t("notes.inviteLinksRevoke")}
          onClick={onRevoke}
          disabled={revoking}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
