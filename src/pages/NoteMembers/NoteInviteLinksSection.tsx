/**
 * 共有リンク（invite-links）管理セクション — Phase 3 (viewer 限定)。
 *
 * - 発行: ロール viewer 固定 / 有効期限 (1/7/30/カスタム最大 90 日) / 利用上限 (1..100 / 無制限) / ラベル
 * - 一覧: 取り消し済みを除外して表示（API が `isNull(revoked_at)` でフィルタ）
 * - コピー / 取り消し
 *
 * Share-link management UI. Phase 3 keeps the role pinned to `viewer`; editor
 * support lands in Phase 5 (#662) and this component wraps the role select in
 * a disabled hint so we don't surprise users when it flips on later.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Copy, Loader2, Plus, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
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
 * Section props.
 * セクションの Props。
 */
export interface NoteInviteLinksSectionProps {
  noteId: string;
  /** Test-only injection point for "now" so expiry labels are deterministic. */
  now?: () => number;
}

/**
 * 発行フォーム + 一覧を組み合わせたセクション。
 * Create form + list rolled into a single section.
 */
export const NoteInviteLinksSection: React.FC<NoteInviteLinksSectionProps> = ({ noteId, now }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: links = [], isLoading } = useInviteLinksForNote(noteId);
  const createMutation = useCreateInviteLink(noteId);
  const revokeMutation = useRevokeInviteLink(noteId);

  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("d7");
  const [maxUsesPreset, setMaxUsesPreset] = useState<MaxUsesPreset>("10");
  const [label, setLabel] = useState("");

  const handleCreate = useCallback(async () => {
    try {
      const created = await createMutation.mutateAsync({
        role: "viewer",
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
    } catch (err) {
      console.error("Failed to create invite link:", err);
      toast({
        title: t("notes.inviteLinkCreateFailed"),
        variant: "destructive",
      });
    }
  }, [createMutation, expiryPreset, maxUsesPreset, label, toast, t]);

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
      <p className="text-muted-foreground mb-4 text-xs">{t("notes.inviteLinksPhase3Hint")}</p>

      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("notes.inviteLinksLabelPlaceholder")}
          aria-label={t("notes.inviteLinksLabelAria")}
        />
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
        <Button onClick={handleCreate} disabled={createMutation.isPending} className="gap-1">
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t("notes.inviteLinksCreateCta")}
        </Button>
      </div>

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

  return (
    <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b pb-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{link.label ?? t("notes.inviteLinksUnnamed")}</span>
          {statusBadge}
          <span className="text-muted-foreground text-xs">{t("notes.inviteLinksRoleViewer")}</span>
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
