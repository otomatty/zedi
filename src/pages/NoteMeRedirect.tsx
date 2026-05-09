import React from "react";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { useMyNote } from "@/hooks/useNoteQueries";

/**
 * `/notes/me` ランディング。`GET /api/notes/me` を解決し、結果の note id へ
 * `<Navigate to={`/notes/${noteId}`} replace />` で 1 段リダイレクトする。
 * Issue #825（PR 2a）。
 *
 * - 解決中はスケルトンを表示し、レイアウトのジャンプを防ぐ。
 * - 失敗時はそのまま例外を投げず、エラーメッセージのみ描画して
 *   ユーザがページ遷移で復帰できるようにする（404 にはしない）。
 *
 * `/notes/me` landing page. Resolves the caller's default note via
 * `GET /api/notes/me` and performs a single client-side `<Navigate replace>`
 * into `/notes/:noteId`. See issue #825 (PR 2a).
 *
 * - Renders a skeleton while resolving, to avoid layout flicker.
 * - On failure, renders an inline error rather than redirecting elsewhere so
 *   the user can recover via navigation.
 */
const NoteMeRedirect: React.FC = () => {
  const { data, isLoading, error } = useMyNote();

  if (isLoading) {
    return (
      <div className="min-h-0 flex-1 py-10">
        <Container>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (error || !data) {
    // 解決失敗時は 404 にせず、その場で軽量メッセージのみ描画する。
    // Render an inline error instead of cascading to 404 on resolution failure.
    return (
      <div className="min-h-0 flex-1 py-10">
        <Container>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : "Failed to resolve default note."}
          </p>
        </Container>
      </div>
    );
  }

  return <Navigate to={`/notes/${data.id}`} replace />;
};

export default NoteMeRedirect;
