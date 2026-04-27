/**
 * 共有モーダルのドメイン招待タブ (Phase 6 / issue #663)。
 * Domain-access tab inside the share modal — adds, lists, and removes domain
 * rules backed by `note_domain_access`. Free-webmail providers are pre-checked
 * client-side and ultimately rejected by the server.
 *
 * 編集者向けロールでドメインを追加するときは、編集権限が広く渡るリスクが
 * あるため確認ダイアログを挟む。`verifiedAt` は v1 では常に null なので
 * 全ての行で「未検証」バッジを出して注意を促す。
 *
 * Adding an `editor` rule pops a confirmation dialog because it grants edit
 * access to everyone at that domain. `verifiedAt` is always null in v1, so
 * each row carries an "unverified" badge until DNS-TXT verification ships.
 */
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
  useCreateDomainAccess,
  useDeleteDomainAccess,
  useDomainAccessForNote,
} from "@/hooks/useDomainAccess";
import { ApiError } from "@/lib/api";
import { normalizeDomainInput } from "@/lib/domainValidation";
import type { DomainAccessRow } from "@/lib/api/types";

/**
 * ドメインルール選択肢のロール。
 * Roles selectable when adding a domain rule.
 */
type DomainRole = "viewer" | "editor";

/**
 * ドメインタブの Props。
 * Props for the domain tab.
 */
export interface ShareModalDomainTabProps {
  noteId: string;
  /**
   * モーダルが開いているか。閉じている間は React Query を発火させないために
   * `enabled` として下流に渡す。
   * Whether the parent modal is open. Forwarded to React Query as `enabled`
   * so we don't fetch while the modal is hidden.
   */
  enabled: boolean;
}

/**
 * 入力エラーキー判定の戻り値型。`null` ならエラーなし。
 * Result of computing the inline-error label for the domain input.
 */
type InputError = null | { kind: "invalid_format" } | { kind: "free_email"; domain: string };

/**
 * 入力欄の状態 + ミューテーションを 1 つの interface にまとめて引数の数を抑える。
 * Bundle of state passed into the inner add-form to keep the prop list short.
 */
interface AddFormProps {
  domainInput: string;
  setDomainInput: (v: string) => void;
  roleInput: DomainRole;
  setRoleInput: (v: DomainRole) => void;
  onAdd: () => void;
  isPending: boolean;
  isValid: boolean;
  inputError: InputError;
}

/**
 * 入力フォーム部分。`AlertDialog` の確認ロジックは親側に残しているので、ここは
 * 値の表示と「追加」ボタンの click ハンドラを呼ぶだけのプレゼンテーション層。
 *
 * Add-form section. The confirmation flow lives in the parent; this component
 * is purely presentational and just calls `onAdd` when the button is clicked.
 */
function DomainAccessAddForm({
  domainInput,
  setDomainInput,
  roleInput,
  setRoleInput,
  onAdd,
  isPending,
  isValid,
  inputError,
}: AddFormProps) {
  const { t } = useTranslation();
  const errorMessage = (() => {
    if (!inputError) return null;
    if (inputError.kind === "invalid_format") return t("notes.domainTabCreateFailedInvalid");
    return t("notes.domainTabCreateFailedFreeEmail", { domain: inputError.domain });
  })();
  return (
    <section className="border-border/60 space-y-3 rounded-lg border p-4">
      <h4 className="text-sm font-semibold">{t("notes.domainTabAddHeading")}</h4>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <div className="flex flex-col gap-1">
          <Input
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder={t("notes.domainPlaceholder")}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? "domain-input-error" : undefined}
          />
          {errorMessage ? (
            <p id="domain-input-error" className="text-destructive text-xs">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <Select value={roleInput} onValueChange={(value) => setRoleInput(value as DomainRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">{t("notes.domainTabRoleViewer")}</SelectItem>
            <SelectItem value="editor">{t("notes.domainTabRoleEditor")}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onAdd} disabled={isPending || !isValid}>
          {t("notes.domainTabAdd")}
        </Button>
      </div>
    </section>
  );
}

/**
 * 一覧行。ロールバッジ・未検証バッジ・削除ボタンを 1 行で描画する。
 * Single row inside the rule list — role + unverified badge + remove button.
 */
function DomainAccessRuleItem({
  rule,
  onRemove,
  removePending,
}: {
  rule: DomainAccessRow;
  onRemove: (rule: DomainAccessRow) => void;
  removePending: boolean;
}) {
  const { t } = useTranslation();
  const roleLabel =
    rule.role === "editor" ? t("notes.domainTabRoleEditor") : t("notes.domainTabRoleViewer");
  return (
    <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{rule.domain}</span>
          <Badge variant="secondary">{roleLabel}</Badge>
          {rule.verified_at === null ? (
            <Badge variant="outline" title={t("notes.domainTabUnverifiedHint")} className="text-xs">
              {t("notes.domainTabUnverifiedBadge")}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {t("notes.domainTabRuleSummary", { domain: rule.domain, role: roleLabel })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("notes.domainTabRemoveAria", { domain: rule.domain })}
        title={t("notes.domainTabRemove")}
        onClick={() => onRemove(rule)}
        disabled={removePending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * 共有モーダルのドメインタブ。ドメインルールの追加・一覧・削除を扱う。
 * Domain tab — handles add / list / remove for domain-access rules.
 */
export function ShareModalDomainTab({ noteId, enabled }: ShareModalDomainTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: rules, isLoading } = useDomainAccessForNote(noteId, enabled);
  const createMutation = useCreateDomainAccess(noteId);
  const deleteMutation = useDeleteDomainAccess(noteId);

  const [domainInput, setDomainInput] = useState("");
  const [roleInput, setRoleInput] = useState<DomainRole>("viewer");
  const [pendingEditorConfirm, setPendingEditorConfirm] = useState<{ domain: string } | null>(null);

  const validation = useMemo(() => normalizeDomainInput(domainInput), [domainInput]);
  const inputError: InputError = useMemo(() => {
    if (validation.ok) return null;
    if (domainInput.trim().length === 0) return null;
    if (validation.error.kind === "invalid_format") return { kind: "invalid_format" };
    if (validation.error.kind === "free_email") {
      return { kind: "free_email", domain: validation.error.domain };
    }
    return null;
  }, [validation, domainInput]);

  const submitCreate = async (domain: string) => {
    try {
      await createMutation.mutateAsync({ domain, role: roleInput });
      setDomainInput("");
      setRoleInput("viewer");
      toast({ title: t("notes.domainTabCreated") });
    } catch (error) {
      // サーバーが正規化前のドメインを 400 で拒否した場合のフォールバック表示。
      // Fallback messaging when the server rejects an input we let through.
      let message = t("notes.domainTabCreateFailed");
      if (error instanceof ApiError && error.status === 400) {
        const lower = error.message.toLowerCase();
        if (lower.includes("free email")) {
          message = t("notes.domainTabCreateFailedFreeEmail", { domain });
        } else if (lower.includes("invalid format")) {
          message = t("notes.domainTabCreateFailedInvalid");
        } else if (lower.includes("required")) {
          message = t("notes.domainTabCreateFailedEmpty");
        }
      }
      toast({ title: message, variant: "destructive" });
    }
  };

  const handleAddClick = () => {
    if (!validation.ok) {
      if (validation.error.kind === "empty") {
        toast({ title: t("notes.domainTabCreateFailedEmpty"), variant: "destructive" });
      }
      return;
    }
    if (roleInput === "editor") {
      setPendingEditorConfirm({ domain: validation.domain });
      return;
    }
    void submitCreate(validation.domain);
  };

  const handleConfirmEditorAdd = () => {
    if (!pendingEditorConfirm) return;
    const { domain } = pendingEditorConfirm;
    setPendingEditorConfirm(null);
    void submitCreate(domain);
  };

  const handleRemove = async (rule: DomainAccessRow) => {
    try {
      await deleteMutation.mutateAsync({ accessId: rule.id });
      toast({ title: t("notes.domainTabRemoved") });
    } catch {
      toast({ title: t("notes.domainTabRemoveFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 pt-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">{t("notes.domainTabHeading")}</h3>
        <p className="text-muted-foreground text-xs">{t("notes.domainTabDescription")}</p>
      </header>

      <DomainAccessAddForm
        domainInput={domainInput}
        setDomainInput={setDomainInput}
        roleInput={roleInput}
        setRoleInput={setRoleInput}
        onAdd={handleAddClick}
        isPending={createMutation.isPending}
        isValid={validation.ok}
        inputError={inputError}
      />

      <section className="space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("notes.domainTabLoading")}</p>
        ) : !rules || rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.domainTabNoRules")}</p>
        ) : (
          rules.map((rule) => (
            <DomainAccessRuleItem
              key={rule.id}
              rule={rule}
              onRemove={(target) => void handleRemove(target)}
              removePending={deleteMutation.isPending}
            />
          ))
        )}
      </section>

      <AlertDialog
        open={pendingEditorConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEditorConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("notes.domainTabRoleEditor")}</AlertDialogTitle>
            <AlertDialogDescription>{t("notes.domainTabEditorWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEditorAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? t("common.saving") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
