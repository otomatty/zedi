import React from 'react';
import { Sparkles, User } from 'lucide-react';
import { ChatMessage, ChatAction } from '../../types/aiChat';
import { getDisplayContent } from '../../lib/aiChatActions';
import { AIChatActionCard } from './AIChatActionCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIChatMessageProps {
  message: ChatMessage;
  onExecuteAction?: (action: ChatAction) => void;
}

export function AIChatMessage({ message, onExecuteAction }: AIChatMessageProps) {
  const isUser = message.role === 'user';
  const displayContent = isUser ? message.content : getDisplayContent(message.content);

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        {isUser ? <User className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </div>
      
      <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-2 rounded-2xl text-sm ${
          isUser 
            ? 'bg-primary text-primary-foreground rounded-tr-sm' 
            : 'bg-muted text-foreground rounded-tl-sm'
        }`}>
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{displayContent}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
        
        {message.error && (
          <div className="text-xs text-destructive mt-1">
            {message.error}
          </div>
        )}
        
        {/* Action Cards */}
        {message.actions && message.actions.length > 0 && onExecuteAction && (
          <div className="mt-2 w-full space-y-2">
            {message.actions.map((action, i) => (
              <AIChatActionCard
                key={i}
                action={action}
                onExecute={onExecuteAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
