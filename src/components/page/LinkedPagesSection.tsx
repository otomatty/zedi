import { useNavigate } from "react-router-dom";
import { Link2, FilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@zedi/ui";
import { LinkSection } from "./LinkSection";
import { LinkGroupRow } from "./LinkGroupRow";
import { GhostLinkCard } from "./GhostLinkCard";
import { useLinkedPages } from "@/hooks/pages/useLinkedPages";
import { useCreatePage } from "@/hooks/pages/usePageQueries";

interface LinkedPagesSectionProps {
  pageId: string;
  isSyncingLinks?: boolean;
  /**
   * データ取得経路。`"repo"`（既定）は IndexedDB から、`"api"` は
   * `GET /api/pages/:id/public-links` 経由で取得する。
   *
   * Data source. `"repo"` (default) reads IndexedDB; `"api"` calls
   * `GET /api/pages/:id/public-links`.
   */
  mode?: "repo" | "api";
  /**
   * ゴーストリンク（新規ページ作成 UI）を表示するかどうか。
   * 既定では `mode === "repo"` のときのみ表示する（後方互換）。
   * 認証済み編集者が `mode="api"` を使うケース（ノートネイティブページ等）では
   * 明示的に `true` を渡すことでゴーストリンクを表示できる。逆にゲストには
   * `false` を渡して `useCreatePage` mutation 失敗を防ぐ。
   *
   * Whether to render ghost links (new-page-creation UI). Defaults to
   * `mode === "repo"` for backward compatibility. Authenticated editors using
   * `mode="api"` (e.g. note-native pages) can opt into ghost links by passing
   * `true`. Guest views must pass `false` to avoid triggering the
   * authenticated `useCreatePage` mutation.
   */
  showGhostLinks?: boolean;
}

function LinkedPagesSkeleton() {
  return (
    <div className="mt-6 space-y-4 border-t pt-6">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * ページ本文の下に表示するリンク済みページ一覧。同一ノート内の
 * outgoing WikiLink・backlink・ゴーストリンクを描画する。
 *
 * - `mode="repo"` (既定): IndexedDB から取得し 2-hop も表示する。編集者向け。
 * - `mode="api"`: `GET /api/pages/:id/public-links` から取得する。公開ノートを
 *   ゲストが閲覧する `NotePagePublicView` や、IndexedDB に永続化されない
 *   ノートネイティブページの編集者からも呼ばれる経路。
 * - `showGhostLinks`: ゴーストリンクの表示可否。既定は `mode === "repo"`。
 *   認証済み編集者が `mode="api"` を使う場合は `true` を渡せば表示できる。
 * - `isSyncingLinks=true` の間は skeleton を返す。
 *
 * Renders the linked-pages section below the page body, listing same-note
 * outgoing WikiLinks, backlinks, and ghost links.
 *
 * - `mode="repo"` (default): reads from IndexedDB and includes 2-hop content
 *   (editor flow).
 * - `mode="api"`: reads from `GET /api/pages/:id/public-links`. Used by
 *   `NotePagePublicView` for guests and by editors of note-native pages
 *   that are not persisted to IndexedDB.
 * - `showGhostLinks`: gates the ghost-link UI. Defaults to `mode === "repo"`.
 *   Authenticated editors using `mode="api"` can pass `true` to keep ghost
 *   cards visible.
 * - While `isSyncingLinks=true`, a skeleton is rendered instead.
 *
 * @see {@link LinkedPagesSectionProps}
 */
export function LinkedPagesSection({
  pageId,
  isSyncingLinks = false,
  mode = "repo",
  showGhostLinks = mode === "repo",
}: LinkedPagesSectionProps) {
  const { t } = useTranslation();
  /**
   *
   */
  const { data, isLoading } = useLinkedPages(pageId, { mode });
  /**
   *
   */
  const navigate = useNavigate();
  /**
   *
   */
  const createPageMutation = useCreatePage();

  if (isLoading || isSyncingLinks) {
    return <LinkedPagesSkeleton />;
  }

  if (!data) return null;

  /**
   *
   */
  const { outgoingLinks, outgoingLinksWithChildren, backlinks, ghostLinks } = data;

  // Combine outgoing links (without children) and backlinks into "リンク" section
  /**
   *
   */
  const allLinks = [...outgoingLinks, ...backlinks];

  // `showGhostLinks` で抑止されている場合は、その存在をセクション全体の
  // 表示判定からも除外する（ゴーストだけのとき空セクションが残らないように）。
  // When ghost links are gated off via `showGhostLinks`, exclude them from
  // the overall visibility check so the section can collapse cleanly.
  const ghostLinksVisible = showGhostLinks && ghostLinks.length > 0;

  /**
   *
   */
  const hasAnyLinks =
    allLinks.length > 0 || outgoingLinksWithChildren.length > 0 || ghostLinksVisible;

  if (!hasAnyLinks) return null;

  /**
   * リンクされたページへ遷移する。PageCard には `noteId` が含まれているので
   * `/notes/:noteId/:pageId` を直接組み立てられる（Issue #889 Phase 3）。
   * Navigate to a linked page. `PageCard` carries `noteId`, so we can build
   * `/notes/:noteId/:pageId` directly (Issue #889 Phase 3).
   */
  const handlePageClick = (id: string, noteId: string) => {
    navigate(`/notes/${noteId}/${id}`);
  };

  /**
   *
   */
  const handleGhostLinkClick = async (title: string) => {
    // Create a new page with the ghost link title
    try {
      /**
       *
       */
      const newPage = await createPageMutation.mutateAsync({ title });
      navigate(`/notes/${newPage.noteId}/${newPage.id}`, { flushSync: true });
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  };

  return (
    <div className="mt-6 space-y-6 border-t pt-6">
      {/* Links with 2-hop children (horizontal layout) */}
      {outgoingLinksWithChildren.length > 0 && (
        <div className="space-y-4">
          {outgoingLinksWithChildren.map((linkGroup) => (
            <LinkGroupRow
              key={linkGroup.source.id}
              linkGroup={linkGroup}
              onPageClick={handlePageClick}
            />
          ))}
        </div>
      )}

      {/* Combined Links section (outgoing without children + backlinks) */}
      {allLinks.length > 0 && (
        <LinkSection
          title={t("common.page.linkSection", { count: allLinks.length })}
          icon={<Link2 className="h-4 w-4" />}
          pages={allLinks}
          onPageClick={handlePageClick}
        />
      )}

      {/* Ghost Links (renamed to 新しいリンク) — `showGhostLinks` で制御。
          ゲスト経路では `useCreatePage` mutation が失敗するため抑止する。
          Ghost Links — gated by `showGhostLinks`. Guest paths must keep it
          false because the `useCreatePage` mutation requires authentication. */}
      {showGhostLinks && ghostLinks.length > 0 && (
        <div className="space-y-3">
          <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <FilePlus className="h-4 w-4" />
            <span>{t("common.page.newLinksSection", { count: ghostLinks.length })}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {ghostLinks.map((title) => (
              <GhostLinkCard
                key={title}
                title={title}
                onClick={() => handleGhostLinkClick(title)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
