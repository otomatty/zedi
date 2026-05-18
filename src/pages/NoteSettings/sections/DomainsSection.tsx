/**
 * `/notes/:noteId/settings/domains` — ドメイン招待ルールの追加・一覧・削除セクション。
 *
 * 旧 `ShareModalDomainTab` の実装を設定画面のサブルートに移植したもの。
 * - 編集者ロールでルールを追加すると確認ダイアログを挟む（広く編集権限が渡るため）
 * - `verifiedAt` が null の行は「未検証」バッジを必ず表示
 * - owner は追加・削除可、editor は read-only で一覧閲覧のみ
 *
 * Domains section. Carried over from the former `ShareModalDomainTab` —
 * adds a confirmation dialog for editor-role rules, surfaces an
 * "unverified" badge whenever `verifiedAt` is null, and renders read-only
 * for editors.
 */
import React, { useMemo, useState } from "react";
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
import type { DomainValidationError, DomainValidationResult } from "@/lib/domainValidation";
import type { DomainAccessRow } from "@/lib/api/types";
import { useNoteSettingsContext } from "../NoteSettingsContext";

type DomainRole = "viewer" | "editor";

type InputError = null | { kind: "invalid_format" } | { kind: "free_email"; domain: string };

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
      <h3 className="text-sm font-semibold">{t("notes.domainTabAddHeading")}</h3>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <div className="flex flex-col gap-1">
          <Input
            value={domainInput}
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder={t("notes.domainPlaceholder")}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? "domain-section-error" : undefined}
          />
          {errorMessage ? (
            <p id="domain-section-error" className="text-destructive text-xs">
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
 * 一覧 1 行の描画。ドメイン / ロール / 未検証バッジ / 削除ボタンをまとめる。
 * Single rule row — domain, role badge, unverified badge, remove button.
 */
function DomainAccessRuleItem({
  rule,
  onRemove,
  removePending,
  readOnly = false,
}: {
  rule: DomainAccessRow;
  onRemove: (rule: DomainAccessRow) => void;
  removePending: boolean;
  readOnly?: boolean;
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
      {!readOnly ? (
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
      ) : null}
    </div>
  );
}

/**
 * `/notes/:noteId/settings/domains` セクション本体。owner はルール追加 /
 * 削除、editor は read-only で一覧閲覧、viewer は no-access。
 *
 * Section body for `/notes/:noteId/settings/domains`. Owner edits, editor
 * read-only, viewer locked out.
 */
const DomainsSection: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { note, canManage, canViewAsEditor } = useNoteSettingsContext();
  const canShow = canManage || canViewAsEditor;
  const readOnly = !canManage;

  const enabled = canShow;
  const { data: rules, isLoading, isError } = useDomainAccessForNote(note.id, enabled);
  const createMutation = useCreateDomainAccess(note.id);
  const deleteMutation = useDeleteDomainAccess(note.id);

  const [domainInput, setDomainInput] = useState("");
  const [roleInput, setRoleInput] = useState<DomainRole>("viewer");
  const [pendingEditorConfirm, setPendingEditorConfirm] = useState<{ domain: string } | null>(null);

  const validation: DomainValidationResult = useMemo(
    () => normalizeDomainInput(domainInput),
    [domainInput],
  );
  // `in` 演算子で narrowing する（`validation.ok` 経由の narrowing が
  // useMemo クロージャ・ターナリの両方で TS に伝わらないケースを回避）。
  // Use the `in` operator to narrow: TS sometimes refuses to narrow via
  // `validation.ok` through useMemo closures or ternaries, so we pivot on
  // the `error` key directly.
  const validationError: DomainValidationError | null =
    "error" in validation ? validation.error : null;
  const inputError: InputError = useMemo(() => {
    if (!validationError) return null;
    if (domainInput.trim().length === 0) return null;
    if (validationError.kind === "invalid_format") return { kind: "invalid_format" };
    if (validationError.kind === "free_email") {
      return { kind: "free_email", domain: validationError.domain };
    }
    return null;
  }, [validationError, domainInput]);

  const submitCreate = async (domain: string) => {
    try {
      await createMutation.mutateAsync({ domain, role: roleInput });
      setDomainInput("");
      setRoleInput("viewer");
      toast({ title: t("notes.domainTabCreated") });
    } catch (error) {
      const description = error instanceof ApiError && error.message ? error.message : undefined;
      toast({
        title: t("notes.domainTabCreateFailed"),
        description,
        variant: "destructive",
      });
    }
  };

  const handleAddClick = () => {
    if (validationError) {
      if (validationError.kind === "empty") {
        toast({ title: t("notes.domainTabCreateFailedEmpty"), variant: "destructive" });
      }
      return;
    }
    // `validationError` が null のときは ok ブランチが確定するが、TS の narrowing
    // が `useMemo` 経由で `validation` に伝わらないため `domain` を直接読む
    // 経路でフォールバックする（`validationError` が null = 正常 = domain 有）。
    // `domain` lives on the ok-branch; safely read it via the in-narrowed
    // local since TS won't carry narrowing back to `validation` reliably.
    const domain = "domain" in validation ? validation.domain : null;
    if (!domain) return;
    if (roleInput === "editor") {
      setPendingEditorConfirm({ domain });
      return;
    }
    void submitCreate(domain);
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

  if (!canShow) {
    return (
      <p className="text-muted-foreground text-sm">{t("notes.noPermissionToManageMembers")}</p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">{t("notes.settingsNav.domains")}</h2>
        <p className="text-muted-foreground text-xs">{t("notes.domainTabDescription")}</p>
      </header>

      {!readOnly ? (
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
      ) : null}

      <section className="space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">{t("notes.domainTabLoading")}</p>
        ) : isError ? (
          <p className="text-destructive text-sm" role="alert">
            {t("notes.domainTabLoadFailed")}
          </p>
        ) : !rules || rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notes.domainTabNoRules")}</p>
        ) : (
          rules.map((rule) => (
            <DomainAccessRuleItem
              key={rule.id}
              rule={rule}
              onRemove={(target) => void handleRemove(target)}
              removePending={deleteMutation.isPending}
              readOnly={readOnly}
            />
          ))
        )}
      </section>

      <AlertDialog
        open={!readOnly && pendingEditorConfirm !== null}
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
};

export default DomainsSection;
