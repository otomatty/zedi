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

/** Default panel width in pixels. / パネルの既定幅（ピクセル） */
const DEFAULT_PANEL_WIDTH = 352;
/** Minimum panel width in pixels. / パネルの最小幅（ピクセル） */
export const MIN_PANEL_WIDTH = 280;
/** Maximum panel width in pixels. / パネルの最大幅（ピクセル） */
export const MAX_PANEL_WIDTH = 600;

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
  /** パネル幅（ピクセル） / Panel width in pixels */
  panelWidth: number;

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
  setPanelWidth: (width: number) => void;
}

/**
 * Global Zustand store for AI chat panel UI (open state, model, persisted prefs).
 * AI チャットドックの UI 状態（開閉・モデル選択など）を保持するストア。
 */
export const useAIChatStore = create<AIChatUIState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeConversationId: null,
      isStreaming: false,
      contextEnabled: true,
      showConversationList: false,
      pendingPageToAdd: null,
      selectedModel: null,
      panelWidth: DEFAULT_PANEL_WIDTH,

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
      setPanelWidth: (width) =>
        set({ panelWidth: Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width)) }),
    }),
    {
      name: "ai-chat-storage",
      version: 1,
      partialize: (state) => ({
        isOpen: state.isOpen,
        contextEnabled: state.contextEnabled,
        selectedModel: state.selectedModel,
        panelWidth: state.panelWidth,
      }),
    },
  ),
);
