import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AIChatUIState {
  isOpen: boolean;
  activeConversationId: string | null;
  isStreaming: boolean;
  contextEnabled: boolean;
  showConversationList: boolean;

  // Actions
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (id: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  toggleContext: () => void;
  toggleConversationList: () => void;
}

export const useAIChatStore = create<AIChatUIState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeConversationId: null,
      isStreaming: false,
      contextEnabled: true,
      showConversationList: false,

      togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setStreaming: (isStreaming) => set({ isStreaming }),
      toggleContext: () => set((state) => ({ contextEnabled: !state.contextEnabled })),
      toggleConversationList: () => set((state) => ({ showConversationList: !state.showConversationList })),
    }),
    {
      name: 'ai-chat-storage',
      partialize: (state) => ({
        isOpen: state.isOpen,
        contextEnabled: state.contextEnabled,
      }),
    }
  )
);
