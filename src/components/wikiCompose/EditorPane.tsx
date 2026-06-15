/**
 * `EditorPane` — left pane of the Wiki Compose split view (#950).
 *
 * 分割画面の左ペイン。タイトル + Tiptap ベースのエディタを表示する想定だが、
 * Compose 中の draft 進捗を確認できるよう、本実装ではセクション本文を
 * Markdown プレビューとして直接描画する MVP に絞る。確定後 (`phase === "completed"`)
 * は完成 Markdown を一括表示し、ユーザーはノートに戻ってから Tiptap で確定する。
 *
 * Read-only preview of the streaming/drafted content. Each outline section
 * gets its own `## heading` block. The currently-streaming section is
 * highlighted with a pulsing border so the user sees where to look.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@zedi/ui";
import { replaceWikiLinksInMarkdown } from "@/components/aiChat/aiChatMarkdownHelpers";
import type { DraftedSection, OutlineSection } from "@/lib/wikiCompose/types";

/**
 * Render compose body Markdown to styled HTML.
 *
 * The draft body is Markdown source (headings, lists, `[[wiki links]]`, …), so
 * it must be parsed — not dumped into a `<pre>` — for the surrounding `prose`
 * styles to apply. `[[Title]]` is normalised to `[Title](wiki:Title)` and shown
 * as a non-navigating `.wiki-link` chip (the compose preview cannot yet resolve
 * whether the target page exists).
 *
 * draft 本文は Markdown ソースなので、`<pre>` ではなくパースして描画する。
 * `[[Title]]` は wiki link チップとして表示する（プレビューでは遷移しない）。
 */
const PreviewMarkdown: React.FC<{ source: string }> = React.memo(({ source }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      // Drop images so the preview never fires off-site requests (tracking
      // beacons) for URLs that slipped into the AI-generated body.
      // 画像はトラッキングビーコン化を防ぐためプレビューでは描画しない。
      img: () => null,
      a: ({ href, children }) => {
        if (href?.startsWith("wiki:")) {
          return <span className="wiki-link">{children}</span>;
        }
        const safeHref = href && /^(https?|mailto|tel):/i.test(href) ? href : undefined;
        return (
          <a href={safeHref} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }}
  >
    {replaceWikiLinksInMarkdown(source)}
  </ReactMarkdown>
));
PreviewMarkdown.displayName = "PreviewMarkdown";

export interface EditorPaneProps {
  title: string;
  outline: OutlineSection[];
  draftedSections: Record<string, DraftedSection>;
  sectionBuffers: Record<string, string>;
  streamingSectionId: string | null;
  /** Markdown preview to render when the run completes. */
  completedMarkdown: string | null;
}

/** Render the left preview pane. */
export const EditorPane: React.FC<EditorPaneProps> = ({
  title,
  outline,
  draftedSections,
  sectionBuffers,
  streamingSectionId,
  completedMarkdown,
}) => {
  const { t } = useTranslation();
  return (
    <div
      data-testid="compose-editor-pane"
      className="bg-background prose prose-sm dark:prose-invert h-full max-w-none overflow-auto px-4 py-4 sm:px-6 sm:py-6"
    >
      <h1 className="!mb-2">{title || t("wikiCompose.editor.untitled")}</h1>

      {outline.length === 0 && !completedMarkdown ? (
        <p className="text-muted-foreground text-sm italic">{t("wikiCompose.editor.emptyHint")}</p>
      ) : null}

      {outline.length > 0 ? (
        <div className="space-y-6">
          {outline.map((section) => {
            const drafted = draftedSections[section.id];
            const buffer = sectionBuffers[section.id] ?? "";
            const isStreaming = streamingSectionId === section.id;
            const body = drafted?.body ?? buffer;
            return (
              <section
                key={section.id}
                data-testid={`editor-section-${section.id}`}
                className={cn(
                  "rounded-md transition-colors",
                  isStreaming &&
                    "border border-blue-300 px-3 py-2 ring-2 ring-blue-200/40 dark:border-blue-700/60 dark:ring-blue-900/30",
                )}
              >
                {section.depth === 1 ? (
                  <h2 className="!mt-0">{section.heading}</h2>
                ) : (
                  <h3 className="!mt-0">{section.heading}</h3>
                )}
                {body.trim().length === 0 ? (
                  <p className="text-muted-foreground !my-1 text-xs italic">
                    {isStreaming ? t("wikiCompose.editor.streaming") : section.intent}
                  </p>
                ) : (
                  // Render the running/finalised buffer as Markdown so headings,
                  // lists and wiki links pick up the surrounding `prose` styles.
                  // バッファを Markdown として描画し prose スタイルを効かせる。
                  <PreviewMarkdown source={body} />
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {completedMarkdown ? (
        <section data-testid="editor-completed-markdown" className="mt-6 border-t pt-4">
          <h3 className="text-muted-foreground text-xs tracking-wide uppercase">
            {t("wikiCompose.editor.finalMarkdown")}
          </h3>
          <PreviewMarkdown source={completedMarkdown} />
        </section>
      ) : null}
    </div>
  );
};
