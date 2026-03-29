import { Suspense, lazy } from "react";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatViewTabs } from "./AIChatViewTabs";
import { AIChatInput } from "./AIChatInput";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatContextBar } from "./AIChatContextBar";
import { AIChatConversationList } from "./AIChatConversationList";
import { useAIChatPanelContentLogic } from "@/hooks/useAIChatPanelContentLogic";

const AIChatBranchTree = lazy(() =>
  import("./AIChatBranchTree").then((m) => ({ default: m.AIChatBranchTree })),
);

/**
 * Props for {@link AIChatPanelContent}.
 * {@link AIChatPanelContent} 向けプロパティ。
 */
export interface AIChatPanelContentProps {
  /** Currently selected conversation id, or null if none. / 選択中の会話 ID、なければ null */
  activeConversationId: string | null;
  /** Updates the active conversation selection. / 選択中の会話を更新する */
  setActiveConversation: (id: string | null) => void;
  /** When true, page context is passed into the chat flow. / true のときページ文脈をチャットに渡す */
  contextEnabled: boolean;
  /** When true, show the conversation list above the main area. / true のときメイン上部に会話一覧を表示 */
  showConversationList: boolean;
}

/**
 * Main panel body: conversations list, messages or branch tree, and input.
 * パネル本体：会話一覧、メッセージまたはブランチツリー、入力。
 */
export function AIChatPanelContent({
  activeConversationId,
  setActiveConversation,
  contextEnabled,
  showConversationList,
}: AIChatPanelContentProps) {
  const {
    pageConversations,
    handleExecuteAction,
    messages,
    messageMap,
    rootMessageId,
    activeLeafId,
    stopStreaming,
    switchBranch,
    isStreaming,
    handleSendMessage,
    handleSelectConversation,
    handleDeleteConversation,
    handleEditMessage,
    activeViewTab,
    setActiveViewTab,
    inputPrefill,
    focusEditorNonce,
    handleSelectBranch,
    handleBranchFrom,
    handleDeleteBranchFromTree,
  } = useAIChatPanelContentLogic({
    activeConversationId,
    setActiveConversation,
    contextEnabled,
  });

  return (
    <div className="bg-background relative flex h-full flex-col border-l">
      <AIChatHeader />
      <AIChatContextBar />

      <div className="border-border shrink-0 border-b px-4 py-2">
        <AIChatViewTabs activeTab={activeViewTab} onTabChange={setActiveViewTab} />
      </div>

      {showConversationList && (
        <AIChatConversationList
          conversations={pageConversations}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
        />
      )}

      <div className="min-h-0 flex-1">
        {activeViewTab === "chat" ? (
          <AIChatMessages
            messages={messages}
            messageMap={messageMap}
            onSuggestionClick={handleSendMessage}
            onExecuteAction={handleExecuteAction}
            onEditMessage={handleEditMessage}
            onSwitchBranch={switchBranch}
            isStreaming={isStreaming}
          />
        ) : (
          <Suspense fallback={null}>
            <AIChatBranchTree
              messageMap={messageMap}
              rootMessageId={rootMessageId}
              activeLeafId={activeLeafId}
              onSelectBranch={handleSelectBranch}
              onBranchFrom={handleBranchFrom}
              onDeleteBranch={handleDeleteBranchFromTree}
            />
          </Suspense>
        )}
      </div>

      <div className="bg-background border-t p-4">
        <AIChatInput
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
          prefillText={inputPrefill?.text}
          prefillNonce={inputPrefill?.nonce}
          focusEditorNonce={focusEditorNonce}
        />
      </div>
    </div>
  );
}
