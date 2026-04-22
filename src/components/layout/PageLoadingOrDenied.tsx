import React from "react";
import Container from "./Container";

/**
 * Props for {@link PageLoadingOrDenied}.
 * {@link PageLoadingOrDenied} の Props。
 */
export interface PageLoadingOrDeniedProps {
  /** Message or nodes to render inside the centered container. / 中央寄せコンテナに表示するメッセージ／ノード。 */
  children: React.ReactNode;
}

/**
 * Shared shell for in-shell "loading" and "denied / not found" states.
 * Provides a flex-filling padded region with the standard `Container`
 * (max-width + horizontal padding) and `py-10` vertical breathing room,
 * while inheriting scroll behavior from the surrounding app-shell layout.
 *
 * `AppLayout` 配下ルートの「読み込み中 / 権限なし・未検出」表示用の共通シェル。
 * flex 埋め領域に標準の `Container`（最大幅と左右 padding）と上下 `py-10` を適用し、
 * スクロール責務は外側レイアウトに委譲しつつ、他のページと見た目を揃える。
 */
export function PageLoadingOrDenied({ children }: PageLoadingOrDeniedProps): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 py-10">
      <Container>{children}</Container>
    </div>
  );
}
