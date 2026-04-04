import { useEffect, useRef } from "react";
import { cn } from "@zedi/ui";
import type { ChatAction, ChatMessage, MessageMap } from "../../types/aiChat";
import { getSiblings } from "../../lib/messageTree";
import { AIChatMessage } from "./AIChatMessage";
import { AIChatWelcome } from "./AIChatWelcome";

/**
 * Props for {@link AIChatMessages}.
 * {@link AIChatMessages} の props。
 */
interface AIChatMessagesProps {
  messages: ChatMessage[];
  /** Full tree for sibling navigation. / 兄弟ナビ用のツリー全体 */
  messageMap: MessageMap;
  onSuggestionClick: (text: string) => void;
  onExecuteAction?: (action: ChatAction) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  /**
   * カーソル位置にメッセージ内容を挿入するコールバック。
   * Callback to insert message content at editor cursor position.
   */
  onInsertToNote?: (markdown: string) => void;
  /** Switch active branch at a fork. / 分岐点で表示ブランチを切り替え */
  onSwitchBranch?: (messageId: string, direction: "prev" | "next") => void;
  isStreaming?: boolean;
  /** Extra classes on the root (e.g. full-page top inset). / ルートへの追加クラス（フルページの上余白など） */
  className?: string;
}

/**
 * Scrollable message list (welcome or bubbles). Root is a flex column for dock and full-page layouts.
 * スクロール可能なメッセージ一覧（ウェルカムまたはバブル）。ルートはドック／フルページ用の flex 列。
 */
export function AIChatMessages({
  messages,
  messageMap,
  onSuggestionClick,
  onExecuteAction,
  onEditMessage,
  onInsertToNote,
  onSwitchBranch,
  isStreaming = false,
  className,
}: AIChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /**
   * Outer flex column so `flex-1 overflow-y-auto` children get a bounded height in dock and full-page chat.
   * 外側を flex にし、ドック／フルページのどちらでも高さ制約下で内部スクロールできるようにする。
   */
  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {messages.length === 0 ? (
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AIChatWelcome onSuggestionClick={onSuggestionClick} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain scroll-smooth p-4"
        >
          {messages.map((message) => {
            const { siblings, index } = getSiblings(messageMap, message.id);
            const hasSiblings = siblings.length > 1;
            return (
              <AIChatMessage
                key={message.id}
                message={message}
                onExecuteAction={onExecuteAction}
                onEditMessage={onEditMessage}
                onInsertToNote={onInsertToNote}
                siblingIndex={hasSiblings ? index : undefined}
                siblingTotal={hasSiblings ? siblings.length : undefined}
                onSwitchBranch={
                  hasSiblings && onSwitchBranch
                    ? (direction) => onSwitchBranch(message.id, direction)
                    : undefined
                }
                isStreaming={isStreaming}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
