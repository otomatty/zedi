import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import Container from "@/components/layout/Container";

/**
 *
 */
export function NoteViewLoadingOrDenied({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <main className="min-h-0 flex-1 overflow-y-auto py-10">
        <Container>{children}</Container>
      </main>
    </AppLayout>
  );
}
