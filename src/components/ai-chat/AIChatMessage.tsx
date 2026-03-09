import { Sparkles, User } from "lucide-react";
import { ChatMessage, ChatAction } from "../../types/aiChat";
import { getDisplayContent } from "../../lib/aiChatActions";
import { AIChatActionCard } from "./AIChatActionCard";
import { AIChatWikiLink } from "./AIChatWikiLink";
import { UserMessageBubble, renderUserContent } from "./AIChatUserMessageBubble";
import { CodeBlockWithCopy } from "./AIChatCodeBlock";
import { replaceWikiLinksInMarkdown } from "./aiChatMarkdownHelpers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface AIChatMessageProps {
  message: ChatMessage;
  onExecuteAction?: (action: ChatAction) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  isStreaming?: boolean;
}

export function AIChatMessage({
  message,
  onExecuteAction,
  onEditMessage,
  isStreaming = false,
}: AIChatMessageProps) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : getDisplayContent(message.content);
  const showUserEdit = isUser && onEditMessage;

  return (
    <div className={`mb-4 flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </div>

      <div className={`flex max-w-[85%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted text-foreground"
          }`}
        >
          {isUser && showUserEdit ? (
            <UserMessageBubble
              content={displayContent}
              referencedPages={message.referencedPages}
              messageId={message.id}
              onEditMessage={onEditMessage}
              isStreaming={isStreaming}
            />
          ) : isUser ? (
            renderUserContent(displayContent, message.referencedPages)
          ) : (
            <div className="ai-chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: CodeBlockWithCopy,
                  a: ({ href, children }) => {
                    if (href?.startsWith("wiki:")) {
                      let title: string;
                      try {
                        title = decodeURIComponent(href.slice(5));
                      } catch {
                        title = href.slice(5);
                      }
                      return <AIChatWikiLink title={title} />;
                    }
                    const safeHref = href && /^(https?|mailto|tel):/i.test(href) ? href : undefined;
                    return (
                      <a href={safeHref} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {replaceWikiLinksInMarkdown(displayContent)}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
              )}
            </div>
          )}
        </div>

        {!isUser && message.modelDisplayName && !message.isStreaming && (
          <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
            {message.modelDisplayName}
          </span>
        )}

        {message.error && <div className="mt-1 text-xs text-destructive">{message.error}</div>}

        {message.actions && message.actions.length > 0 && onExecuteAction && (
          <div className="mt-2 w-full space-y-2">
            {message.actions.map((action, i) => (
              <AIChatActionCard key={i} action={action} onExecute={onExecuteAction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
