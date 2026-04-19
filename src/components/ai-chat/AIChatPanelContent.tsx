import { Suspense, lazy, useCallback, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn, useToast } from "@zedi/ui";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatViewTabs } from "./AIChatViewTabs";
import { AIChatInput } from "./AIChatInput";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatContextBar } from "./AIChatContextBar";
import { AIChatConversationList } from "./AIChatConversationList";
import { PromoteToWikiDialog } from "./PromoteToWikiDialog";
import { useAIChatPanelContentLogic } from "@/hooks/useAIChatPanelContentLogic";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { usePromoteToWiki } from "@/hooks/usePromoteToWiki";
import { isTauriDesktop } from "@/lib/platform";

const AIChatBranchTree = lazy(() =>
  import("./AIChatBranchTree").then((m) => ({ default: m.AIChatBranchTree })),
);

const AIChatWorkflowPanel = lazy(() =>
  import("./AIChatWorkflowPanel").then((m) => ({ default: m.AIChatWorkflowPanel })),
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

  const { t } = useTranslation();
  const { toast } = useToast();
  const { insertAtCursorRef, pageContext } = useAIChatContext();

  const handleInsertToNote = useCallback(
    (markdown: string) => {
      const ok = insertAtCursorRef.current?.(markdown);
      if (ok) {
        toast({ title: t("aiChat.notifications.insertSuccess") });
      } else {
        toast({
          title: t("aiChat.notifications.insertUnavailable"),
          variant: "destructive",
        });
      }
    },
    [insertAtCursorRef, t, toast],
  );

  const canInsert = pageContext?.type === "editor";

  const promote = usePromoteToWiki(messages);
  const existingTitles = pageContext?.recentPageTitles ?? [];

  /**
   * Workflow タブは Claude Code を必要とするため、Web 環境ではタブ自体を非表示にしている（{@link AIChatViewTabs}）。
   * 万一 web で activeViewTab === "workflow" になった場合でも、ここでマウントを抑制して安全側に倒す。
   *
   * The workflow tab is hidden on web because it requires Claude Code (see {@link AIChatViewTabs}).
   * As a defensive guard, also suppress mounting here if `activeViewTab` somehow becomes "workflow" on web.
   */
  const workflowAvailable = isTauriDesktop();

  /** After the workflow tab is visited once, keep the panel mounted so run state survives tab switches. / ワークフロータブを一度開いたらマウントを維持し、タブ切替で実行状態を失わない */
  const [keepWorkflowMounted, setKeepWorkflowMounted] = useState(
    () => workflowAvailable && activeViewTab === "workflow",
  );
  useLayoutEffect(() => {
    if (workflowAvailable && activeViewTab === "workflow") {
      // Latch: after first visit to the workflow tab, keep the panel mounted so run/pause state survives tab switches.
      // 初回表示後はマウントを維持し、タブ切替で実行状態を失わない。
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way latch from tab selection (not external sync)
      setKeepWorkflowMounted(true);
    }
  }, [activeViewTab, workflowAvailable]);

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
            onInsertToNote={canInsert ? handleInsertToNote : undefined}
            onPromoteToWiki={promote.handlePromote}
            onSwitchBranch={switchBranch}
            isStreaming={isStreaming}
          />
        ) : activeViewTab === "branch" ? (
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
        ) : null}
        {keepWorkflowMounted ? (
          <div
            className={cn(
              "h-full min-h-0 flex-col",
              activeViewTab === "workflow" ? "flex" : "hidden",
            )}
          >
            <Suspense fallback={null}>
              <AIChatWorkflowPanel />
            </Suspense>
          </div>
        ) : null}
      </div>

      {/* Stay mounted on workflow tab so uncontrolled input draft is not lost. / ワークフロー切替で下書きを失わない */}
      <div className={cn("bg-background border-t p-4", activeViewTab === "workflow" && "hidden")}>
        <AIChatInput
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
          prefillText={inputPrefill?.text}
          prefillNonce={inputPrefill?.nonce}
          focusEditorNonce={focusEditorNonce}
        />
      </div>
      <PromoteToWikiDialog
        open={promote.open}
        onClose={promote.close}
        conversationText={promote.conversationText}
        existingTitles={existingTitles}
        conversationId={activeConversationId ?? undefined}
      />
    </div>
  );
}
