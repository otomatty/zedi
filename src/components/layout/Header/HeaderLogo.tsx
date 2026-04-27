import React from "react";
import { Link } from "react-router-dom";

/**
 * アプリ名ロゴ。ページの h1 ではないため見出し要素にしない（ブランド用テキスト）
 * / App brand text in the global header. Not a page &lt;h1&gt;; keep as non-heading
 */
export const HeaderLogo: React.FC = () => (
  <Link to="/home">
    <span className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-2xl font-bold tracking-tight text-transparent transition-opacity hover:opacity-80">
      Zedi
    </span>
  </Link>
);
