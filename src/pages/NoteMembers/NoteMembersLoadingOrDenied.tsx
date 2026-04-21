import React from "react";
import Container from "@/components/layout/Container";

/**
 * Loading/denied state shell for NoteMembers.
 * Outer `AppLayout` is applied at the route level; here we render only the main area.
 * NoteMembers の読み込み中／権限なし表示のシェル。AppLayout は親ルートで適用される。
 */
export function NoteMembersLoadingOrDenied({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-10">
      <Container>{children}</Container>
    </div>
  );
}
