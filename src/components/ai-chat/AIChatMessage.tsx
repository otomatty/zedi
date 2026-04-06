import { useCallback } from "react";
import { ClipboardPaste, Copy, Sparkles, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
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
import { SiblingNavigator } from "./SiblingNavigator";
import { AIChatMessageSkeleton } from "./AIChatMessageSkeleton";
import { ToolExecutionStatus } from "./ToolExecutionStatus";

interface AIChatMessageProps {
  message: ChatMessage;
  onExecuteAction?: (action: ChatAction) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  /**
   * カーソル位置にメッセージ内容を挿入するコールバック。エディタページで利用可能。
   * Callback to insert message content at editor cursor. Available on editor pages.
   */
  onInsertToNote?: (markdown: string) => void;
  /** Sibling index when this message has alternates. / 代替があるときの兄弟インデックス */
  siblingIndex?: number;
  siblingTotal?: number;
  onSwitchBranch?: (direction: "prev" | "next") => void;
  isStreaming?: boolean;
}

/**
 * Renders one chat bubble with optional branch navigation.
 * 1 件のチャットバブルと、任意でブランチ操作を表示する。
 */
// eslint-disable-next-line complexity -- user vs assistant rendering forks
export function AIChatMessage({
  message,
  onExecuteAction,
  onEditMessage,
  onInsertToNote,
  siblingIndex,
  siblingTotal,
  onSwitchBranch,
  isStreaming = false,
}: AIChatMessageProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : getDisplayContent(message.content);
  const showUserEdit = isUser && onEditMessage;
  const showInsertButton = !isUser && !message.isStreaming && onInsertToNote && displayContent;

  const handleCopy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: t("aiChat.actions.copiedCode") });
      } catch {
        toast({ title: t("aiChat.actions.copyFailed"), variant: "destructive" });
      }
    },
    [t, toast],
  );

  return (
    <div className={`mb-4 flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </div>

      <div
        className={`flex max-w-[85%] flex-col ${isUser ? "items-end" : "min-w-0 flex-1 items-start"}`}
      >
        <div
          className={`rounded-2xl px-4 py-2 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground w-full min-w-0 rounded-tl-sm"
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
          ) : message.isStreaming && displayContent === "" ? (
            <AIChatMessageSkeleton />
          ) : (
            <div className="ai-chat-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: CodeBlockWithCopy,
                  a: ({ href, children }) => {
                    if (href?.startsWith("wiki:")) {
                      /**
                       *
                       */
                      let title: string;
                      try {
                        title = decodeURIComponent(href.slice(5));
                      } catch {
                        title = href.slice(5);
                      }
                      return <AIChatWikiLink title={title} />;
                    }
                    /**
                     *
                     */
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

        {!isUser && !message.isStreaming && (
          <div className="mt-1 flex items-center gap-1">
            {showInsertButton && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                onClick={() => onInsertToNote(displayContent)}
                title={t("aiChat.actions.insertToNote")}
              >
                <ClipboardPaste className="h-3 w-3" />
                {t("aiChat.actions.insertToNote")}
              </button>
            )}
            {!isUser && !message.isStreaming && displayContent && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                onClick={() => handleCopy(displayContent)}
                title={t("aiChat.actions.copyMessage")}
              >
                <Copy className="h-3 w-3" />
                {t("aiChat.actions.copyMessage")}
              </button>
            )}
            {message.modelDisplayName && (
              <span className="text-muted-foreground px-1 text-[10px]">
                {message.modelDisplayName}
              </span>
            )}
          </div>
        )}

        {siblingTotal != null && siblingIndex != null && onSwitchBranch && (
          <SiblingNavigator
            currentIndex={siblingIndex}
            total={siblingTotal}
            onSwitch={onSwitchBranch}
            className="mt-1"
          />
        )}

        {!isUser && message.toolExecutions && message.toolExecutions.length > 0 && (
          <ToolExecutionStatus toolExecutions={message.toolExecutions} className="mt-1" />
        )}

        {message.error && <div className="text-destructive mt-1 text-xs">{message.error}</div>}

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
