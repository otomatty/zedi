import React from 'react';
import { useTranslation } from 'react-i18next';
import { CreatePageAction } from '../../types/aiChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIChatPagePreviewProps {
  action: CreatePageAction;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function AIChatPagePreview({
  action,
  onConfirm,
  onEdit,
  onCancel,
}: AIChatPagePreviewProps) {
  const { t } = useTranslation();

  return (
    <div className="border border-primary/50 bg-card rounded-lg overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-primary/5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          📄 {action.title}
        </h3>
      </div>

      {/* Content Preview */}
      <div className="px-4 py-3 max-h-48 overflow-y-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {action.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* WikiLinks */}
      {action.suggestedLinks.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {action.suggestedLinks.map((link) => (
              <span
                key={link}
                className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5"
              >
                [[{link}]]
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors"
        >
          キャンセル
        </button>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent transition-colors"
        >
          {t('aiChat.actions.editAndCreate')}
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('aiChat.actions.createPage')}
        </button>
      </div>
    </div>
  );
}
