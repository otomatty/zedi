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
 * Provides a flex-filling scroll region with the standard `Container`
 * (max-width + horizontal padding) and `py-10` vertical breathing room,
 * matching the other AppLayout-wrapped pages.
 *
 * `AppLayout` 配下ルートの「読み込み中 / 権限なし・未検出」表示用の共通シェル。
 * スクロール可能な flex 埋め領域に、標準の `Container`（最大幅と左右 padding）と
 * 上下 `py-10` を適用し、他のページと見た目を揃える。
 */
export function PageLoadingOrDenied({ children }: PageLoadingOrDeniedProps): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-10">
      <Container>{children}</Container>
    </div>
  );
}
