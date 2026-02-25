import { useEffect, useRef } from "react";
import { ChatMessage, ChatAction } from "../../types/aiChat";
import { AIChatMessage } from "./AIChatMessage";
import { AIChatWelcome } from "./AIChatWelcome";

interface AIChatMessagesProps {
  messages: ChatMessage[];
  onSuggestionClick: (text: string) => void;
  onExecuteAction?: (action: ChatAction) => void;
}

export function AIChatMessages({
  messages,
  onSuggestionClick,
  onExecuteAction,
}: AIChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <AIChatWelcome onSuggestionClick={onSuggestionClick} />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto scroll-smooth p-4">
      {messages.map((message) => (
        <AIChatMessage key={message.id} message={message} onExecuteAction={onExecuteAction} />
      ))}
    </div>
  );
}
