import { Sparkles, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAIChatContext } from "../../contexts/AIChatContext";

interface AIChatWelcomeProps {
  onSuggestionClick: (text: string) => void;
}

/**
 *
 */
export function AIChatWelcome({ onSuggestionClick }: AIChatWelcomeProps) {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const { pageContext } = useAIChatContext();

  /**
   *
   */
  const isEditor = pageContext?.type === "editor";
  /**
   *
   */
  const title = isEditor ? t("aiChat.welcome.editor.title") : t("aiChat.welcome.default.title");

  /**
   *
   */
  const suggestions = isEditor
    ? [
        { id: "summarize", text: t("aiChat.welcome.editor.summarize") },
        { id: "suggestLinks", text: t("aiChat.welcome.editor.suggestLinks") },
        { id: "translate", text: t("aiChat.welcome.editor.translate") },
        { id: "deepDive", text: t("aiChat.welcome.editor.deepDive") },
      ]
    : [
        { id: "organize", text: t("aiChat.welcome.default.organize") },
        { id: "explain", text: t("aiChat.welcome.default.explain") },
        { id: "brainstorm", text: t("aiChat.welcome.default.brainstorm") },
        { id: "draft", text: t("aiChat.welcome.default.draft") },
      ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 flex h-full flex-col items-center justify-center p-6 text-center duration-500">
      <div className="bg-primary/10 mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <Sparkles className="text-primary h-6 w-6" />
      </div>

      <h3 className="mb-8 text-lg font-medium whitespace-pre-line">{title}</h3>

      <div className="w-full max-w-sm space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSuggestionClick(suggestion.text)}
            className="bg-card hover:bg-accent hover:text-accent-foreground w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors"
          >
            {suggestion.text}
          </button>
        ))}
      </div>

      {/* Drag & drop / @mention hint */}
      {!isEditor && (
        <div className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
          <GripVertical className="h-3.5 w-3.5" />
          <span>{t("aiChat.referencedPages.welcomeHint")}</span>
        </div>
      )}
    </div>
  );
}
