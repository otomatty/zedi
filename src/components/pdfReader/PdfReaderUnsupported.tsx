/**
 * Phase 1 で PDF 知識化機能が Web ブラウザから呼ばれた際の案内表示。
 *
 * Placeholder shown when the user navigates to the PDF reader from a non-Tauri
 * runtime. Phase 1 (issue otomatty/zedi#389) intentionally restricts the
 * feature to the desktop app because PDF binaries stay on the user's local
 * filesystem rather than being uploaded.
 */
import { Link } from "react-router-dom";

/**
 * Renders a centered, bilingual message explaining that the PDF feature is
 * desktop-only in Phase 1 and links back to the user's notes.
 * デスクトップ専用案内を中央寄せで表示し、ユーザーのノートに戻るリンクを出す。
 */
export function PdfReaderUnsupported() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">
        {/* JP first per project convention. JP-first per project convention. */}
        PDF 知識化はデスクトップ版のみ対応 / Desktop-only
      </h1>
      <p className="text-muted-foreground text-sm leading-6">
        Phase 1 では PDF ファイルをローカルに保持したまま閲覧・ハイライト・派生ページ化します。
        この処理はデスクトップアプリ（Tauri）が必要です。Web では利用できません。
      </p>
      <p className="text-muted-foreground text-sm leading-6">
        Phase 1 keeps each PDF on your local filesystem and never uploads its bytes. That requires
        the desktop app (Tauri); the web client cannot provide this feature.
      </p>
      <p>
        <Link to="/notes/me" className="text-primary underline">
          ノートに戻る / Back to your notes
        </Link>
      </p>
    </div>
  );
}
