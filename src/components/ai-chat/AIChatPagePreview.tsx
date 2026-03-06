import { useTranslation } from "react-i18next";
import { CreatePageAction } from "../../types/aiChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIChatPagePreviewProps {
  action: CreatePageAction;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function AIChatPagePreview({ action, onConfirm, onEdit, onCancel }: AIChatPagePreviewProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-lg border border-primary/50 bg-card duration-200 animate-in fade-in">
      {/* Header */}
      <div className="border-b bg-primary/5 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">📄 {action.title}</h3>
      </div>

      {/* Content Preview */}
      <div className="max-h-48 overflow-y-auto px-4 py-3">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{action.content}</ReactMarkdown>
        </div>
      </div>

      {/* WikiLinks */}
      {action.suggestedLinks.length > 0 && (
        <div className="border-t bg-muted/30 px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {action.suggestedLinks.map((link) => (
              <span key={link} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                [[{link}]]
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t px-4 py-3">
        <button
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
        >
          キャンセル
        </button>
        <button
          onClick={onEdit}
          className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
        >
          {t("aiChat.actions.editAndCreate")}
        </button>
        <button
          onClick={onConfirm}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("aiChat.actions.createPage")}
        </button>
      </div>
    </div>
  );
}
