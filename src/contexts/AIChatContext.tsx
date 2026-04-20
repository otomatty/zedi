import { createContext, useRef, useContext, useState, type ReactNode } from "react";
import { PageContext } from "../types/aiChat";

interface AIChatContextValue {
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  /** AI追記後にエディタ内容を同期するハンドラ ref */
  contentAppendHandlerRef: React.MutableRefObject<((nextContent: string) => void) | null>;
  /**
   * エディタのカーソル位置にマークダウンを挿入するハンドラ ref。
   * Ref to a handler that inserts markdown at the editor's current cursor position.
   */
  insertAtCursorRef: React.MutableRefObject<((markdown: string) => boolean) | null>;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

/**
 * AIチャットコンテキストプロバイダー。ページ情報・挿入ハンドラを子孫に提供する。
 * Provides page context, content-append handler, and insert-at-cursor handler to descendants.
 */
export function AIChatProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const contentAppendHandlerRef = useRef<((nextContent: string) => void) | null>(null);
  const insertAtCursorRef = useRef<((markdown: string) => boolean) | null>(null);

  return (
    <AIChatContext.Provider
      value={{
        pageContext,
        setPageContext,
        contentAppendHandlerRef,
        insertAtCursorRef,
      }}
    >
      {children}
    </AIChatContext.Provider>
  );
}

/**
 * AIチャットコンテキストを取得するフック。AIChatProvider 内でのみ使用可能。
 * Hook to access the AI chat context. Must be used within an AIChatProvider.
 */
export function useAIChatContext() {
  const context = useContext(AIChatContext);
  if (context === undefined) {
    throw new Error("useAIChatContext must be used within an AIChatProvider");
  }
  return context;
}
