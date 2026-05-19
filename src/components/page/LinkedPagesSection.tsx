import { useNavigate } from "react-router-dom";
import { Link2, FilePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@zedi/ui";
import { LinkSection } from "./LinkSection";
import { LinkGroupRow } from "./LinkGroupRow";
import { GhostLinkCard } from "./GhostLinkCard";
import { useLinkedPages } from "@/hooks/useLinkedPages";
import { useCreatePage } from "@/hooks/usePageQueries";

interface LinkedPagesSectionProps {
  pageId: string;
  isSyncingLinks?: boolean;
  /**
   * データ取得経路。`"repo"`（既定）は IndexedDB から、`"api"` は
   * `GET /api/pages/:id/public-links` 経由で取得する。
   * `"api"` ではゴーストリンク（新規ページ作成 UI）を非表示にする。
   *
   * Data source. `"repo"` (default) reads IndexedDB; `"api"` calls
   * `GET /api/pages/:id/public-links`. Ghost links (which trigger
   * authenticated page creation) are hidden in `"api"` mode.
   */
  mode?: "repo" | "api";
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
 * - `mode="api"`: `GET /api/pages/:id/public-links` から取得し、ゴーストカードを
 *   非表示にする (新規ページ作成 mutation が認証必須のため)。公開ノートを
 *   ゲストが閲覧する `NotePagePublicView` から呼ばれる経路。
 * - `isSyncingLinks=true` の間は skeleton を返す。
 *
 * Renders the linked-pages section below the page body, listing same-note
 * outgoing WikiLinks, backlinks, and ghost links.
 *
 * - `mode="repo"` (default): reads from IndexedDB and includes 2-hop content
 *   (editor flow).
 * - `mode="api"`: reads from `GET /api/pages/:id/public-links` and hides ghost
 *   cards (page-creation requires auth). Used by `NotePagePublicView` for
 *   guests on public / unlisted notes.
 * - While `isSyncingLinks=true`, a skeleton is rendered instead.
 *
 * @see {@link LinkedPagesSectionProps}
 */
export function LinkedPagesSection({
  pageId,
  isSyncingLinks = false,
  mode = "repo",
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

  // api モードではゴーストリンクを非表示にするため、表示判定からも除外する。
  // In api mode ghost links are hidden, so they should not keep the section
  // from collapsing into nothing.
  const ghostLinksVisible = mode === "repo" && ghostLinks.length > 0;

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

      {/* Ghost Links (renamed to 新しいリンク) — repo モードのみ表示。
          api モードはゲスト向けで `useCreatePage` mutation が失敗するため抑止。
          Ghost Links — shown only in repo mode. Suppressed under api mode
          because the `useCreatePage` mutation requires an authenticated user. */}
      {mode === "repo" && ghostLinks.length > 0 && (
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
