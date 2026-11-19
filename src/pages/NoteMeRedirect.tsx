import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Skeleton } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { PageGridSkeleton } from "@/components/page/PageGrid";
import { useContainerColumns } from "@/hooks/useContainerColumns";
import { useMyNote } from "@/hooks/notes/useNoteQueries";
import { useOnboarding } from "@/hooks/auth/useOnboarding";

/**
 * `/notes/me` ランディング。`GET /api/notes/me` を解決し、結果の note id へ
 * `<Navigate to={`/notes/${noteId}`} replace />` で 1 段リダイレクトする。
 * Issue #825（PR 2a）。
 *
 * - クエリはそのまま `/notes/:noteId` に引き継ぐ。
 * - 未ログインユーザーの導線は親ルート側 `ProtectedRoute` がカバーする。
 * - サインイン直後にオンボーディングを終えていない場合は `/onboarding` を
 *   優先し、`useMyNote` の解決結果より前にウィザード画面へ送る（旧
 *   `Home.tsx` から移植）。
 *
 * `/notes/me` landing page. Resolves the caller's default note via
 * `GET /api/notes/me` and performs a single client-side `<Navigate replace>`
 * into `/notes/:noteId`. See issue #825 (PR 2a).
 *
 * - The query string is forwarded to `/notes/:noteId` unchanged.
 * - Guests are bounced through the parent `ProtectedRoute`.
 * - When the user still owes the setup wizard, redirect to `/onboarding`
 *   before resolving the default note (ported from the old `Home.tsx`
 *   behavior).
 *
 * - 解決中はスケルトンを表示し、レイアウトのジャンプを防ぐ。
 * - 失敗時はそのまま例外を投げず、エラーメッセージのみ描画して
 *   ユーザがページ遷移で復帰できるようにする（404 にはしない）。
 *
 * - Renders a skeleton while resolving, to avoid layout flicker.
 * - On failure, renders an inline error rather than redirecting elsewhere so
 *   the user can recover via navigation.
 */
const NoteMeRedirect: React.FC = () => {
  const location = useLocation();
  const { needsSetupWizard } = useOnboarding();
  const { data, isLoading, error } = useMyNote({ enabled: !needsSetupWizard });
  // リダイレクト先の `NoteView` 内 `PageGrid` と同じ列数計測ロジックを使い、
  // 解決中スケルトンと遷移後の実コンテンツでカード列数を一致させる。
  // Use the same container-width measurement as the destination `PageGrid` so
  // the placeholder columns match the eventual rendered grid.
  const { ref: columnsRef, columns } = useContainerColumns();

  // セットアップウィザード未完了のユーザーは先にオンボーディングに送る。
  // useMyNote 側の API は idempotent だがウィザード後にデフォルトノートを
  // 再解決する流れを踏むほうが UX として素直なので、ノート解決の前に分岐する。
  // Send users that haven't finished the setup wizard to `/onboarding` before
  // we let the `useMyNote` query materialize the default note. The endpoint is
  // idempotent, but resolving after the wizard keeps the flow predictable.
  if (needsSetupWizard) {
    return <Navigate to={`/onboarding${location.search}${location.hash}`} replace />;
  }

  if (isLoading) {
    // リダイレクト先 `NoteView` は `Container` 内に「タイトル行 → ページグリッド」の
    // 縦並びを描画するため、解決中も同じ縦リズム（タイトル相当の高さ + `space-y-4`
    // による mt-4 相当のギャップ）を確保した上で、`PageGrid` 本体と同じ
    // `PageGridSkeleton` を表示する。これにより `NoteView` 遷移時にグリッドが
    // 上下にずれるレイアウトジャンプを抑える（PR #898 gemini-code-assist review）。
    //
    // `NoteView` lays out a title row above the page grid inside the same
    // `Container`, so the skeleton mirrors that rhythm: a title-shaped
    // `Skeleton` plus `space-y-4` (≈ the `mt-4` gap above the grid) keeps the
    // skeleton grid aligned with the eventual grid, eliminating the vertical
    // jump observed after redirect (raised by gemini-code-assist on PR #898).
    return (
      <div className="min-h-0 flex-1 py-6">
        <Container>
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <div ref={columnsRef}>
              <PageGridSkeleton columns={columns} />
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

  return <Navigate to={`/notes/${data.id}${location.search}`} replace />;
};

export default NoteMeRedirect;
