import React from "react";
import Container from "@/components/layout/Container";

/**
 * Loading/denied state shell for NoteView.
 * Outer `AppLayout`（ヘッダー・サイドバー）はルートレベルで適用されるため、ここではメイン領域のみを描画する。
 * NoteView の読み込み中／権限なし表示のシェル。AppLayout は親ルートで適用される。
 */
export function NoteViewLoadingOrDenied({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto py-10">
      <Container>{children}</Container>
    </main>
  );
}
