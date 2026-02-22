import React, { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';

interface AIChatInputProps {
  onSendMessage: (message: string) => void;
  onStopStreaming: () => void;
}

export function AIChatInput({ onSendMessage, onStopStreaming }: AIChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isStreaming, contextEnabled } = useAIChatStore();
  const { pageContext } = useAIChatContext();

  // 自動リサイズ
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const placeholder = contextEnabled && pageContext?.type === 'editor'
    ? t('aiChat.placeholders.withContext')
    : t('aiChat.placeholders.default');

  return (
    <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-background border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 max-h-[120px] min-h-[24px] resize-none bg-transparent border-0 focus:ring-0 p-1 text-sm"
        rows={1}
        maxLength={4000}
      />
      
      {isStreaming ? (
        <button
          type="button"
          onClick={onStopStreaming}
          className="p-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors shrink-0"
          title={t('aiChat.actions.stop')}
        >
          <Square className="w-4 h-4 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={t('aiChat.actions.send')}
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}
