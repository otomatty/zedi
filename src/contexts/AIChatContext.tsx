import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PageContext } from '../types/aiChat';

interface AIChatContextValue {
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  /** 現在のページでAIチャットが利用可能かどうか（ContentWithAIChatがマウントされているか） */
  aiChatAvailable: boolean;
  setAIChatAvailable: (available: boolean) => void;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

export function AIChatProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [aiChatAvailable, setAIChatAvailable] = useState(false);

  return (
    <AIChatContext.Provider value={{ pageContext, setPageContext, aiChatAvailable, setAIChatAvailable }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChatContext() {
  const context = useContext(AIChatContext);
  if (context === undefined) {
    throw new Error('useAIChatContext must be used within an AIChatProvider');
  }
  return context;
}
