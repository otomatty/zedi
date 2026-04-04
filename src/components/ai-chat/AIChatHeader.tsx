import { useState, useEffect } from "react";
import { Sparkles, ClipboardList, Plus, X, Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useAIChatStore } from "../../stores/aiChatStore";
import { AI_CHAT_BASE_PATH, aiChatConversationPath } from "@/constants/aiChatSidebar";
import { AI_SETTINGS_CHANGED_EVENT, loadAISettings } from "@/lib/aiSettings";
import {
  type AIInteractionMode,
  getInteractionMode,
  getProviderById,
  DEFAULT_AI_SETTINGS,
} from "@/types/ai";

/**
 * AI chat dock header: list, new chat, open full page, close, and mode badge.
 * AI チャットドックのヘッダー（一覧・新規・フルページで開く・閉じる・モードバッジ）。
 */
export function AIChatHeader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { closePanel, toggleConversationList, setActiveConversation, activeConversationId } =
    useAIChatStore();

  const [modeInfo, setModeInfo] = useState<{
    mode: AIInteractionMode;
    providerName?: string;
  }>({ mode: "default" });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const settings = await loadAISettings();
      if (cancelled) return;
      const s = settings ?? DEFAULT_AI_SETTINGS;
      const mode = getInteractionMode(s);
      const providerName =
        mode === "user_api_key" ? (getProviderById(s.provider)?.name ?? s.provider) : undefined;
      setModeInfo({ mode, providerName });
    };
    void refresh();
    const onSettingsChanged = () => {
      void refresh();
    };
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [location.pathname, location.search]);

  const handleNewConversation = () => {
    setActiveConversation(null);
  };

  const handleOpenFullPage = () => {
    if (activeConversationId) {
      navigate(aiChatConversationPath(activeConversationId));
    } else {
      navigate(AI_CHAT_BASE_PATH);
    }
    closePanel();
  };

  const handleOpenSettings = () => {
    navigate("/settings?section=ai");
    closePanel();
  };

  const modeLabel = (() => {
    switch (modeInfo.mode) {
      case "default":
        return t("aiChat.mode.default");
      case "user_api_key":
        return modeInfo.providerName
          ? t("aiChat.mode.apiKeyWithProvider", { provider: modeInfo.providerName })
          : t("aiChat.mode.apiKey");
      case "claude_code":
        return t("aiChat.mode.claudeCode");
    }
  })();

  return (
    <div className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary h-5 w-5" />
        <h2 className="font-semibold">{t("aiChat.title")}</h2>
        <button
          type="button"
          onClick={handleOpenSettings}
          className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-full px-2 py-0.5 text-[10px] transition-colors"
          title={t("aiChat.mode.openSettings")}
        >
          {modeLabel}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleConversationList}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.conversationList")}
        >
          <ClipboardList className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleNewConversation}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.newConversation")}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleOpenFullPage}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.openInPage", "Open in full page")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={closePanel}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
