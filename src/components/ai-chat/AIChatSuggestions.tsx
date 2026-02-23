import React from "react";
import { useTranslation } from "react-i18next";
import { useAIChatContext } from "../../contexts/AIChatContext";

interface AIChatSuggestionsProps {
  onSuggestionClick: (text: string) => void;
}

export function AIChatSuggestions({ onSuggestionClick }: AIChatSuggestionsProps) {
  const { t } = useTranslation();
  const { pageContext } = useAIChatContext();

  const isEditor = pageContext?.type === "editor";

  const suggestions = isEditor
    ? [
        t("aiChat.welcome.editor.summarize"),
        t("aiChat.welcome.editor.suggestLinks"),
        t("aiChat.welcome.editor.translate"),
        t("aiChat.welcome.editor.deepDive"),
      ]
    : [
        t("aiChat.welcome.default.organize"),
        t("aiChat.welcome.default.explain"),
        t("aiChat.welcome.default.brainstorm"),
        t("aiChat.welcome.default.draft"),
      ];

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {suggestions.map((suggestion, i) => (
        <button
          key={i}
          onClick={() => onSuggestionClick(suggestion)}
          className="rounded-full border bg-card px-2.5 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
