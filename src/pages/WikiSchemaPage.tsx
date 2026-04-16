/**
 * Wiki Schema editing page — the user-defined "constitution" for their wiki.
 * ユーザー定義の Wiki スキーマ（「憲法」）を編集するページ。
 */
import React, { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button, useToast } from "@zedi/ui";
import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
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
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to="/settings" aria-label={t("common.back")}>
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </Link>
            </Button>
            <h1 className="truncate text-xl font-semibold">{t("wikiSchema.title")}</h1>
          </div>
          <Button onClick={handleSave} disabled={!isDirty || isUpdating} size="sm">
            {isUpdating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("wikiSchema.save")}
          </Button>
        </Container>
      </header>

      <main className="py-6">
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
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[400px] w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      </main>
    </div>
  );
};

export default WikiSchemaPage;
