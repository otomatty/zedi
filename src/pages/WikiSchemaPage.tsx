/**
 * Wiki Schema editing page — the user-defined "constitution" for their wiki.
 * ユーザー定義の Wiki スキーマ（「憲法」）を編集するページ。
 */
import React, { useState, useCallback, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { useTranslation } from "react-i18next";
import { useWikiSchema } from "@/hooks/useWikiSchema";

/**
 * Textarea-based schema editing page. Users define heading structure, naming
 * conventions, citation rules, and other wiki-wide constraints here.
 *
 * テキストエリアベースのスキーマ編集ページ。見出し構成・命名規則・出典ルール等を定義する。
 */
const WikiSchemaPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading, updateSchema, isUpdating } = useWikiSchema();

  const [title, setTitle] = useState("Wiki Schema");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  // Track the data id to know when remote data has changed.
  const [syncedId, setSyncedId] = useState<string | null>(null);

  // Sync from remote only when the page id changes (initial load / after save).
  useEffect(() => {
    if (data && data.pageId !== syncedId) {
      setSyncedId(data.pageId);
    }
  }, [data, syncedId]);

  // Apply remote data when syncedId changes (avoids setState-in-render).
  useEffect(() => {
    if (!data) return;
    setTitle(data.title || "Wiki Schema");
    setContent(data.content || "");
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally sync once per pageId
  }, [syncedId]);

  const handleSave = useCallback(async () => {
    try {
      await updateSchema({ title, content });
      setIsDirty(false);
      toast({ title: t("wikiSchema.saved") });
    } catch {
      toast({ title: t("wikiSchema.saveFailed"), variant: "destructive" });
    }
  }, [title, content, updateSchema, toast, t]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("wikiSchema.title")}
        backTo="/settings"
        backLabel={t("common.back")}
        actions={
          <Button onClick={handleSave} disabled={!isDirty || isUpdating} size="sm">
            {isUpdating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("wikiSchema.save")}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <Container>
          <div className="mx-auto max-w-2xl space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">{t("wikiSchema.description")}</p>

                <div className="space-y-2">
                  <label htmlFor="schema-title" className="text-sm font-medium">
                    {t("wikiSchema.titleLabel")}
                  </label>
                  <input
                    id="schema-title"
                    type="text"
                    disabled={isUpdating}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="schema-content" className="text-sm font-medium">
                    {t("wikiSchema.contentLabel")}
                  </label>
                  <textarea
                    id="schema-content"
                    disabled={isUpdating}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[400px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder={t("wikiSchema.placeholder")}
                  />
                </div>
              </>
            )}
          </div>
        </Container>
      </div>
    </div>
  );
};

export default WikiSchemaPage;
