import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@zedi/ui";
import { PageLoadingOrDenied } from "@/components/layout/PageLoadingOrDenied";
import { useNoteApi } from "@/hooks/useNoteQueries";
import { ApiError } from "@/lib/api";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import type { Page } from "@/types/page";
import { PageEditorContent } from "./PageEditorContent";

const NOOP = (): void => undefined;

/**
 * `NotePagePublicView` の Props。
 * Props for {@link NotePagePublicView}.
 */
export interface NotePagePublicViewProps {
  /**
   * 表示対象ページの ID。
   * Page id being displayed (read-only).
   */
  pageId: string;
  /**
   * 親 `NotePageView` が既に取得済みのページメタデータ。
   * タイトルや `sourceUrl` を即時描画するために使用する。
   *
   * Page metadata already fetched by the parent `NotePageView`. Used to
   * render the title and source URL badge immediately while the public
   * content endpoint resolves.
   */
  page: Page;
}

/**
 * `!canEdit` (guest / viewer) なユーザー向けの読み取り専用ページビュー。
 * Phase 1 で追加した `GET /api/pages/:id/public-content` を用いて
 * Y.Doc / WebSocket を一切張らずに本文を表示する。
 *
 * Read-only page view for non-editor visitors (guest and viewer roles).
 * Loads the plain-text body via the public content endpoint added in
 * Phase 1, avoiding any Y.Doc or WebSocket connection.
 *
 * NOTE: `content_text` is a plain-text projection produced by the
 * Hocuspocus side (`extractPlainTextFromYXmlFragment`). Inline marks
 * (bold/italic/link) and complex nodes are lost at extraction time, so
 * this view renders paragraphed plain text. If higher fidelity is
 * required the public endpoint should be extended to return Tiptap JSON.
 *
 * 注意: `content_text` は Hocuspocus 側 (`extractPlainTextFromYXmlFragment`)
 * が生成したプレーンテキスト射影で、太字 / リンク等のマークや複合ノードは
 * 既に欠落している。高フィデリティな読み取りビューが必要になったら
 * 公開エンドポイントを Tiptap JSON 返却へ拡張する。
 *
 * @remarks `useCollaboration` API は触らない。`NotePageView` 側で
 * `canEdit === false` 時は `enabled: false` でフックを呼ぶため、
 * このコンポーネントは WebSocket を全く張らずに描画する。
 *
 * @remarks This component intentionally does not call `useCollaboration`.
 * The parent `NotePageView` already disables collaboration when
 * `canEdit === false`, so no WebSocket is opened on the read-only path.
 */
export const NotePagePublicView: React.FC<NotePagePublicViewProps> = ({ pageId, page }) => {
  const { t } = useTranslation();
  const { api } = useNoteApi();

  // 専用フックを別途切らない理由: 現状の consumer はこの 1 箇所のみ。
  // 2 件目が増えたら `pageKeys.publicContent(pageId)` を切り出して hoist する。
  // Inlined to avoid a new shared hook while this is the sole consumer; if a
  // second caller appears, hoist the query key into `pageKeys.publicContent`.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["page-public-content", pageId],
    queryFn: () => api.getPagePublicContent(pageId),
    enabled: Boolean(pageId),
    staleTime: 1000 * 60,
  });

  // `PageEditorContent.content` は `useContentSanitizer` 内で `JSON.parse` される
  // Tiptap JSON 前提のため、プレーンテキストの `content_text` を直接渡すと解析
  // エラーになる。`convertMarkdownToTiptapContent` で paragraph 列の doc に変換
  // してから渡す。`dropLeadingH1` は付けない (人手入力経路と同じ扱い)。
  //
  // `PageEditorContent.content` expects a JSON-stringified Tiptap doc (it is
  // parsed via `JSON.parse` inside `useContentSanitizer`). Convert the plain
  // text to a paragraph-only doc here. `dropLeadingH1` is left off to match
  // the human-input path's behavior.
  // React Compiler が依存配列を狭く解釈できるよう一度ローカル変数に取り出す。
  // Pull the value into a local first so React Compiler can infer the dep
  // precisely (it can't trace optional chaining inside the deps array).
  const contentText = data?.content_text ?? null;
  const tiptapContent = useMemo(
    () => (contentText ? convertMarkdownToTiptapContent(contentText) : ""),
    [contentText],
  );

  if (isLoading) {
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </PageLoadingOrDenied>
    );
  }

  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    const message =
      status === 404
        ? "ページが見つかりません"
        : status === 403
          ? "閲覧権限がありません"
          : "ページの読み込みに失敗しました";
    const showRetry = status !== 404 && status !== 403;
    return (
      <PageLoadingOrDenied>
        <p className="text-muted-foreground text-sm">{message}</p>
        {showRetry && (
          <Button onClick={() => void refetch()} aria-label={t("common.retry", "Retry")}>
            {t("common.retry", "Retry")}
          </Button>
        )}
      </PageLoadingOrDenied>
    );
  }

  return (
    <PageEditorContent
      content={tiptapContent}
      title={data?.title ?? page.title ?? ""}
      sourceUrl={page.sourceUrl}
      // `currentPageId={null}` で LinkedPagesSection と LintSuggestions の描画を抑止する
      // (どちらも認証必須エンドポイントを叩くためゲスト互換性のために必須)。
      // Suppress LinkedPagesSection / LintSuggestions (both call authenticated
      // endpoints) by leaving currentPageId null. WikiLink scope still works
      // via the `pageId` prop below.
      currentPageId={null}
      pageId={page.id}
      isNewPage={false}
      isWikiGenerating={false}
      isReadOnly
      showLinkedPages={false}
      showToolbar={false}
      onContentChange={NOOP}
      onContentError={NOOP}
      pageNoteId={page.noteId ?? null}
    />
  );
};

export default NotePagePublicView;
