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
import React, { useState, useCallback, useEffect } from "react";
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

/**
 * Dialog for extracting entities from chat and creating wiki pages.
 * チャットからエンティティを抽出し Wiki ページを作成するダイアログ。
 */
export function PromoteToWikiDialog({
  open,
  onClose,
  conversationText,
  existingTitles,
  conversationId,
}: PromoteToWikiDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { mutateAsync: createPage } = useCreatePage();
  const { data: schemaData } = useWikiSchema();

  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract entities when dialog opens
  useEffect(() => {
    if (!open || isExtracting || entities.length > 0) return;

    const extract = async () => {
      setIsExtracting(true);
      setError(null);
      try {
        const settings = await loadAISettings();
        if (!settings) throw new Error("AI not configured");

        const prompt = buildExtractEntitiesPrompt(conversationText, existingTitles);
        let result = "";

        await callAIService(
          { ...settings, isConfigured: true },
          {
            provider: settings.provider,
            model: settings.model,
            messages: [{ role: "user", content: prompt }],
            options: { maxTokens: 2000, temperature: 0.3, feature: "entity_extraction" },
          },
          {
            onChunk: (chunk) => {
              result += chunk;
            },
            onComplete: () => {
              const parsed = parseExtractedEntities(result);
              setEntities(parsed);
              // Select all by default
              setSelected(new Set(parsed.map((_, i) => i)));
            },
            onError: (err) => {
              setError(err.message);
            },
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsExtracting(false);
      }
    };

    void extract();
  }, [open, isExtracting, entities.length, conversationText, existingTitles]);

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
      // Create the first selected entity as a page with streaming generation
      const first = selectedEntities[0];
      const page = await createPage({
        title: first.title,
        content: "",
      });

      if (page?.id) {
        const pending: PendingChatPageGenerationState = {
          outline: `- ${first.summary}`,
          conversationText,
          userSchema: schemaData?.content,
          conversationId,
        };
        navigate(`/page/${page.id}`, {
          state: { pendingChatPageGeneration: pending },
        });
      }

      // Create remaining entities as empty pages (can be generated later)
      for (let i = 1; i < selectedEntities.length; i++) {
        await createPage({
          title: selectedEntities[i].title,
          content: "",
        });
      }

      toast({ title: t("aiChat.notifications.promoteSuccess") });
      onClose();
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

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setEntities([]);
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  if (!open) return null;

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
