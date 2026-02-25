import React from "react";
import { Sparkles, User, FileText } from "lucide-react";
import { ChatMessage, ChatAction, ReferencedPage } from "../../types/aiChat";
import { getDisplayContent } from "../../lib/aiChatActions";
import { AIChatActionCard } from "./AIChatActionCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIChatMessageProps {
  message: ChatMessage;
  onExecuteAction?: (action: ChatAction) => void;
}

/** Render user message content with inline @PageTitle styled as badges */
function renderUserContent(content: string, referencedPages?: ReferencedPage[]) {
  if (!referencedPages || referencedPages.length === 0) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
  }

  // Build a regex that matches @Title for each referenced page
  const escapedTitles = referencedPages.map((p) => p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(@(?:${escapedTitles.join("|")}))(?=\\s|$)`, "g");
  const parts = content.split(pattern);

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const matchedRef = referencedPages.find((p) => part === `@${p.title}`);
        if (matchedRef) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary-foreground/20 px-1.5 py-0 align-baseline text-xs font-medium text-primary-foreground/90"
            >
              <FileText className="h-3 w-3 shrink-0" />
              {matchedRef.title}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
}

export function AIChatMessage({ message, onExecuteAction }: AIChatMessageProps) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : getDisplayContent(message.content);

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
          {isUser ? (
            renderUserContent(displayContent, message.referencedPages)
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
              {message.isStreaming && (
                <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Model name label for assistant messages */}
        {!isUser && message.modelDisplayName && !message.isStreaming && (
          <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
            {message.modelDisplayName}
          </span>
        )}

        {message.error && <div className="mt-1 text-xs text-destructive">{message.error}</div>}

        {/* Action Cards */}
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
