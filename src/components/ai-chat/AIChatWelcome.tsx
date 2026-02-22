import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatContext } from '../../contexts/AIChatContext';

interface AIChatWelcomeProps {
  onSuggestionClick: (text: string) => void;
}

export function AIChatWelcome({ onSuggestionClick }: AIChatWelcomeProps) {
  const { t } = useTranslation();
  const { pageContext } = useAIChatContext();

  const isEditor = pageContext?.type === 'editor';
  const title = isEditor ? t('aiChat.welcome.editor.title') : t('aiChat.welcome.default.title');
  
  const suggestions = isEditor ? [
    { id: 'summarize', text: t('aiChat.welcome.editor.summarize') },
    { id: 'suggestLinks', text: t('aiChat.welcome.editor.suggestLinks') },
    { id: 'translate', text: t('aiChat.welcome.editor.translate') },
    { id: 'deepDive', text: t('aiChat.welcome.editor.deepDive') },
  ] : [
    { id: 'organize', text: t('aiChat.welcome.default.organize') },
    { id: 'explain', text: t('aiChat.welcome.default.explain') },
    { id: 'brainstorm', text: t('aiChat.welcome.default.brainstorm') },
    { id: 'draft', text: t('aiChat.welcome.default.draft') },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-primary" />
      </div>
      
      <h3 className="text-lg font-medium mb-8 whitespace-pre-line">
        {title}
      </h3>

      <div className="w-full max-w-sm space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="w-full text-left px-4 py-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
          >
            {suggestion.text}
          </button>
        ))}
      </div>
    </div>
  );
}
