import { Paperclip, ToggleLeft, ToggleRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";

/**
 *
 */
export function AIChatContextBar() {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const { contextEnabled, toggleContext } = useAIChatStore();
  /**
   *
   */
  const { pageContext } = useAIChatContext();

  if (pageContext?.type !== "editor" || !pageContext.pageTitle) {
    return null;
  }

  return (
    <div className="bg-muted/50 text-muted-foreground flex items-center justify-between border-b px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 truncate">
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {t("aiChat.context.referencing", { title: pageContext.pageTitle })}
        </span>
      </div>

      <button
        onClick={toggleContext}
        className="hover:text-foreground ml-2 flex shrink-0 items-center gap-1 transition-colors"
        title={contextEnabled ? "コンテキストを無効化" : "コンテキストを有効化"}
      >
        {contextEnabled ? (
          <ToggleRight className="text-primary h-4 w-4" />
        ) : (
          <ToggleLeft className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
