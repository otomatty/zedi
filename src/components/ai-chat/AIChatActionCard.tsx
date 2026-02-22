import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatAction,
  CreatePageAction,
  AppendToPageAction,
  CreateMultiplePagesAction,
  SuggestWikiLinksAction,
} from '../../types/aiChat';

interface AIChatActionCardProps {
  action: ChatAction;
  onExecute: (action: ChatAction) => void;
}

export function AIChatActionCard({ action, onExecute }: AIChatActionCardProps) {
  switch (action.type) {
    case 'create-page':
      return <CreatePageCard action={action} onExecute={onExecute} />;
    case 'append-to-page':
      return <AppendToPageCard action={action} onExecute={onExecute} />;
    case 'create-multiple-pages':
      return <CreateMultiplePagesCard action={action} onExecute={onExecute} />;
    case 'suggest-wiki-links':
      return <SuggestWikiLinksCard action={action} onExecute={onExecute} />;
    default:
      return null;
  }
}

function CreatePageCard({
  action,
  onExecute,
}: {
  action: CreatePageAction;
  onExecute: (action: ChatAction) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border border-primary/50 bg-primary/5 rounded-lg p-4 animate-in fade-in duration-200">
      <p className="text-sm font-medium mb-2">
        {t('aiChat.suggestions.createPage', { title: action.title })}
      </p>
      <p className="text-xs text-muted-foreground mb-2">{action.reason}</p>

      {action.content && (
        <div className="text-xs bg-muted/50 rounded p-2 mb-3 max-h-24 overflow-hidden">
          {action.content.slice(0, 200)}
          {action.content.length > 200 && '...'}
        </div>
      )}

      {action.suggestedLinks.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {action.suggestedLinks.map((link) => (
            <span
              key={link}
              className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5"
            >
              [[{link}]]
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onExecute(action)}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('aiChat.actions.createPage')}
        </button>
        <button
          onClick={() => onExecute({ ...action, type: 'create-page' })}
          className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-accent transition-colors"
        >
          {t('aiChat.actions.editAndCreate')}
        </button>
      </div>
    </div>
  );
}

function AppendToPageCard({
  action,
  onExecute,
}: {
  action: AppendToPageAction;
  onExecute: (action: ChatAction) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border border-primary/50 bg-primary/5 rounded-lg p-4 animate-in fade-in duration-200">
      <p className="text-sm font-medium mb-2">
        {t('aiChat.suggestions.appendToPage', { title: action.pageTitle })}
      </p>
      <p className="text-xs text-muted-foreground mb-2">{action.reason}</p>

      {action.content && (
        <div className="text-xs bg-muted/50 rounded p-2 mb-3 max-h-24 overflow-hidden">
          {action.content.slice(0, 200)}
          {action.content.length > 200 && '...'}
        </div>
      )}

      <button
        onClick={() => onExecute(action)}
        className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {t('aiChat.actions.appendToPage')}
      </button>
    </div>
  );
}

function CreateMultiplePagesCard({
  action,
  onExecute,
}: {
  action: CreateMultiplePagesAction;
  onExecute: (action: ChatAction) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = React.useState<Set<number>>(
    new Set(action.pages.map((_, i) => i))
  );

  const togglePage = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="border border-primary/50 bg-primary/5 rounded-lg p-4 animate-in fade-in duration-200">
      <p className="text-sm font-medium mb-2">
        {t('aiChat.suggestions.createMultiplePages')}
      </p>
      <p className="text-xs text-muted-foreground mb-2">{action.reason}</p>

      <div className="space-y-1.5 mb-3">
        {action.pages.map((page, i) => (
          <label
            key={i}
            className="flex items-center gap-2 text-xs cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(i)}
              onChange={() => togglePage(i)}
              className="rounded border-primary"
            />
            <span>📄 {page.title}</span>
          </label>
        ))}
      </div>

      {action.linkStructure.length > 0 && (
        <div className="text-xs text-muted-foreground mb-3">
          {action.linkStructure.map((link, i) => (
            <div key={i}>
              {link.from} → [[{link.to}]]
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          const filteredAction: CreateMultiplePagesAction = {
            ...action,
            pages: action.pages.filter((_, i) => selected.has(i)),
          };
          onExecute(filteredAction);
        }}
        disabled={selected.size === 0}
        className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {t('aiChat.actions.createMultiple')}
      </button>
    </div>
  );
}

function SuggestWikiLinksCard({
  action,
  onExecute,
}: {
  action: SuggestWikiLinksAction;
  onExecute: (action: ChatAction) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border border-primary/50 bg-primary/5 rounded-lg p-4 animate-in fade-in duration-200">
      <p className="text-sm font-medium mb-2">{action.reason}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {action.links.map((link) => (
          <span
            key={link.keyword}
            className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5"
          >
            [[{link.existingPageTitle || link.keyword}]]
          </span>
        ))}
      </div>

      <button
        onClick={() => onExecute(action)}
        className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
      >
        {t('aiChat.actions.addLink')}
      </button>
    </div>
  );
}
