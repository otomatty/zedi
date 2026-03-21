import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReferencedPage } from "../types/aiChat";
import type { AIProviderType } from "../types/ai";

interface SelectedModel {
  id: string; // namespaced id e.g. "openai:gpt-4o-mini"
  provider: AIProviderType;
  model: string; // API model ID e.g. "gpt-4o-mini"
  displayName: string;
  inputCostUnits?: number;
  outputCostUnits?: number;
}

interface AIChatUIState {
  isOpen: boolean;
  activeConversationId: string | null;
  isStreaming: boolean;
  contextEnabled: boolean;
  showConversationList: boolean;
  /** コンテキストメニューなど外部からの参照追加リクエスト */
  pendingPageToAdd: ReferencedPage | null;
  /** チャット欄で選択中のモデル */
  selectedModel: SelectedModel | null;

  // Actions
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (id: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  toggleContext: () => void;
  toggleConversationList: () => void;
  setPendingPageToAdd: (page: ReferencedPage | null) => void;
  setSelectedModel: (model: SelectedModel | null) => void;
}

export /**
 *
 */
const useAIChatStore = create<AIChatUIState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeConversationId: null,
      isStreaming: false,
      contextEnabled: true,
      showConversationList: false,
      pendingPageToAdd: null,
      selectedModel: null,

      togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setStreaming: (isStreaming) => set({ isStreaming }),
      toggleContext: () => set((state) => ({ contextEnabled: !state.contextEnabled })),
      toggleConversationList: () =>
        set((state) => ({ showConversationList: !state.showConversationList })),
      setPendingPageToAdd: (page) => set({ pendingPageToAdd: page }),
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "ai-chat-storage",
      version: 1,
      partialize: (state) => ({
        isOpen: state.isOpen,
        contextEnabled: state.contextEnabled,
        selectedModel: state.selectedModel,
      }),
    },
  ),
);
