/**
 * Dialog for promoting a chat conversation to wiki page(s).
 * チャット会話を Wiki ページに昇格させるダイアログ。
 *
 * Flow:
 * 1. User clicks "Wiki に残す" on an assistant message
 * 2. Dialog opens — sends conversation to LLM for entity extraction
 * 3. User selects entities to create as wiki pages
 * 4. Selected entities are created as new pages via the existing create-page flow
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  buildExtractEntitiesPrompt,
  parseExtractedEntities,
  type ExtractedEntity,
} from "@/lib/aiChat/extractEntitiesPrompt";
import { callAIService } from "@/lib/aiService";
import { loadAISettings } from "@/lib/aiSettings";
import { useCreatePage } from "@/hooks/usePageQueries";
import { useWikiSchema } from "@/hooks/useWikiSchema";
import type { PendingChatPageGenerationState } from "@/types/chatPageGeneration";
import { EntityRow } from "./EntityRow";

/**
 * Props for the PromoteToWikiDialog.
 * PromoteToWikiDialog のプロパティ。
 */
interface PromoteToWikiDialogProps {
  /** Whether the dialog is open. / ダイアログが開いているか */
  open: boolean;
  /** Close handler. / 閉じるハンドラー */
  onClose: () => void;
  /** Serialized conversation text for entity extraction. / エンティティ抽出用シリアライズ済み会話テキスト */
  conversationText: string;
  /** Known page titles for isNew determination. / 既存ページタイトル一覧 */
  existingTitles: string[];
  /** Conversation id for provenance. / 出典用会話 ID */
  conversationId?: string;
}

type DialogBodyProps = Omit<PromoteToWikiDialogProps, "open">;

/**
 * Outer wrapper that avoids running hooks (including `useNavigate`) when the
 * dialog is closed — keeps non-Router callers and test environments working.
 * ダイアログ非表示時はフック未実行にし、Router 非配下の呼び出しやテスト環境でも動くようにする。
 */
export function PromoteToWikiDialog({ open, ...rest }: PromoteToWikiDialogProps) {
  if (!open) return null;
  return <PromoteToWikiDialogBody {...rest} />;
}

/**
 * Builds a `callAIService`-compatible handler set that parses entities on completion.
 * エンティティ抽出用のコールバックセットを組み立てる。
 */
function createExtractionHandlers(
  onEntities: (entities: ExtractedEntity[]) => void,
  onError: (err: Error) => void,
) {
  let result = "";
  return {
    onChunk: (chunk: string) => {
      result += chunk;
    },
    onComplete: () => onEntities(parseExtractedEntities(result)),
    onError,
  };
}

/**
 * Runs the extraction LLM call once per open cycle.
 * ダイアログを開くたびに 1 回だけ抽出 LLM を呼ぶ。
 */
function useEntityExtraction(
  conversationText: string,
  existingTitles: string[],
  onEntities: (entities: ExtractedEntity[]) => void,
) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const extract = async () => {
      setIsExtracting(true);
      setError(null);
      try {
        const settings = await loadAISettings();
        if (!settings) throw new Error("AI not configured");
        const prompt = buildExtractEntitiesPrompt(conversationText, existingTitles);
        await callAIService(
          { ...settings, isConfigured: true },
          {
            provider: settings.provider,
            model: settings.model,
            messages: [{ role: "user", content: prompt }],
            options: { maxTokens: 2000, temperature: 0.3, feature: "entity_extraction" },
          },
          createExtractionHandlers(onEntities, (err) => setError(err.message)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsExtracting(false);
      }
    };

    void extract();
  }, [conversationText, existingTitles, onEntities]);

  return { isExtracting, error };
}

/**
 * Inner dialog body — only mounted when `open=true`, so `useNavigate` and data
 * hooks are only evaluated with a live Router / provider context.
 * 本体コンポーネント。`open=true` のときのみマウントされるので、Router / プロバイダの実体が必ず存在する。
 */

function PromoteToWikiDialogBody({
  onClose,
  conversationText,
  existingTitles,
  conversationId,
}: DialogBodyProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { mutateAsync: createPage } = useCreatePage();
  const { data: schemaData } = useWikiSchema();

  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  const handleEntities = useCallback((parsed: ExtractedEntity[]) => {
    setEntities(parsed);
    setSelected(new Set(parsed.map((_, i) => i)));
  }, []);

  const { isExtracting, error } = useEntityExtraction(
    conversationText,
    existingTitles,
    handleEntities,
  );

  const toggleEntity = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleCreate = useCallback(async () => {
    const selectedEntities = entities.filter((_, i) => selected.has(i));
    if (selectedEntities.length === 0) return;

    setIsCreating(true);
    try {
      // Create all pages in parallel before navigating so that navigation-induced
      // unmount cannot interrupt in-flight creations.
      // 並列でページ作成してから遷移する（遷移に伴うアンマウントで作成が中断されないように）。
      const created = await Promise.all(
        selectedEntities.map((entity) =>
          createPage({ title: entity.title, content: "" }).catch(() => null),
        ),
      );

      const firstCreated = created.find((p): p is NonNullable<typeof p> => p != null);
      if (!firstCreated?.id) throw new Error("no pages created");

      const firstEntity = selectedEntities[created.indexOf(firstCreated)];
      const pending: PendingChatPageGenerationState = {
        outline: `- ${firstEntity.summary}`,
        conversationText,
        userSchema: schemaData?.content,
        conversationId,
      };
      toast({ title: t("aiChat.notifications.promoteSuccess") });
      onClose();
      navigate(`/page/${firstCreated.id}`, {
        state: { pendingChatPageGeneration: pending },
      });
    } catch {
      toast({ title: t("aiChat.notifications.promoteFailed"), variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  }, [
    entities,
    selected,
    createPage,
    navigate,
    conversationText,
    schemaData,
    conversationId,
    toast,
    t,
    onClose,
  ]);

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-background border-border w-full max-w-md rounded-lg border p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("aiChat.actions.promoteToWiki")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isExtracting && (
          <div className="flex items-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground text-sm">
              {t("aiChat.notifications.promoteStarted")}
            </span>
          </div>
        )}

        {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

        {!isExtracting && entities.length > 0 && (
          <div className="space-y-2">
            {entities.map((entity, i) => (
              <EntityRow
                key={i}
                entity={entity}
                index={i}
                isSelected={selected.has(i)}
                onToggle={toggleEntity}
              />
            ))}
          </div>
        )}

        {!isExtracting && entities.length > 0 && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("aiChat.actions.cancel")}
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={selected.size === 0 || isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("aiChat.actions.createPage")} ({selected.size})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
