import React from "react";
import { Link } from "react-router-dom";

/**
 * アプリ名ロゴ。ページの h1 ではないため見出し要素にしない（ブランド用テキスト）。
 * リンク先はマイノート一覧 `/notes/me`。`/home` はブックマーク・拡張向けの互換ルート
 * （`LegacyHomeRedirect`）として残すが、ここから経由させる必要はない。
 *
 * App brand text in the global header. Not a page &lt;h1&gt;; keep as non-heading.
 * Links to `/notes/me`. `/home` stays as a legacy redirect only—no need to hop through it here.
 */
export const HeaderLogo: React.FC = () => (
  <Link to="/notes/me">
    <span className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-2xl font-bold tracking-tight text-transparent transition-opacity hover:opacity-80">
      Zedi
    </span>
  </Link>
);
