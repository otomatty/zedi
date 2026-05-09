import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { useMyNote } from "@/hooks/useNoteQueries";
import { useOnboarding } from "@/hooks/useOnboarding";
import { isClipUrlAllowed } from "@/lib/webClipper";

/**
 * `/notes/me` ランディング。`GET /api/notes/me` を解決し、結果の note id へ
 * `<Navigate to={`/notes/${noteId}`} replace />` で 1 段リダイレクトする。
 * Issue #825（PR 2a）。
 *
 * 加えて、Chrome 拡張の `clipUrl` ハンドオフ（issue #826）にも対応する。
 * - `?clipUrl=<URL>` を受け取った場合、`isClipUrlAllowed` でクライアント側
 *   バリデーションを行い、合格した URL のみ `/notes/:noteId?clipUrl=...` に
 *   引き継ぐ。バリデーション NG の値は黙って落として再フェッチや誤クリップを
 *   防ぐ。
 * - 未ログインユーザーの導線は親ルート側 `ProtectedRoute` がカバーする。
 *   `ProtectedRoute` は元 URL を `?returnTo=` に詰めて `/sign-in` に飛ばすので
 *   サインイン後に `clipUrl` 付きで戻ってこられる。
 * - サインイン直後にオンボーディングを終えていない場合は `/onboarding` を
 *   優先し、`useMyNote` の解決結果より前にウィザード画面へ送る（旧
 *   `Home.tsx` から移植）。
 *
 * `/notes/me` landing page. Resolves the caller's default note via
 * `GET /api/notes/me` and performs a single client-side `<Navigate replace>`
 * into `/notes/:noteId`. See issue #825 (PR 2a).
 *
 * Issue #826 also routes the Chrome-extension `clipUrl` hand-off through
 * here:
 * - When a `?clipUrl=<URL>` query is present, the URL is validated with
 *   `isClipUrlAllowed`. Only valid URLs are forwarded to
 *   `/notes/:noteId?clipUrl=...`; rejected values are dropped silently to
 *   avoid feeding `chrome://`-style payloads or private hosts to the clip
 *   pipeline.
 * - Guests are bounced through the parent `ProtectedRoute`, which now stamps
 *   the original path/query into `?returnTo=` so post-auth callback can
 *   restore `/notes/me?clipUrl=...` end-to-end.
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
  const [searchParams] = useSearchParams();
  const { needsSetupWizard } = useOnboarding();
  const { data, isLoading, error } = useMyNote();

  // セットアップウィザード未完了のユーザーは先にオンボーディングに送る。
  // useMyNote 側の API は idempotent だがウィザード後にデフォルトノートを
  // 再解決する流れを踏むほうが UX として素直なので、ノート解決の前に分岐する。
  // Send users that haven't finished the setup wizard to `/onboarding` before
  // we let `useMyNote` materialize the default note. The endpoint is
  // idempotent, but resolving after the wizard keeps the flow predictable.
  if (needsSetupWizard) {
    return <Navigate to="/onboarding" replace />;
  }

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

  // クリップ URL を `/notes/:noteId` に引き継ぐ。検証 NG の値は捨てる。
  // Forward a validated `clipUrl` into the note view; drop invalid values.
  const rawClipUrl = searchParams.get("clipUrl");
  const validClipUrl = rawClipUrl && isClipUrlAllowed(rawClipUrl) ? rawClipUrl : null;
  const targetSearch = validClipUrl
    ? `?${new URLSearchParams({ clipUrl: validClipUrl }).toString()}`
    : "";

  return <Navigate to={`/notes/${data.id}${targetSearch}`} replace />;
};

export default NoteMeRedirect;
