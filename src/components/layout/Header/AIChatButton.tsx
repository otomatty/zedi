import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../../stores/aiChatStore";
import { useAIChatContext } from "../../../contexts/AIChatContext";
import { useNavigate, useLocation } from "react-router-dom";
import { loadAISettings } from "../../../lib/aiSettings";
import { Sparkles } from "lucide-react";

export function AIChatButton() {
  const { t } = useTranslation();
  const { isOpen, togglePanel, isStreaming } = useAIChatStore();
  const { aiChatAvailable } = useAIChatContext();
  const navigate = useNavigate();
  const location = useLocation();

  // AIチャットが利用できないページではボタンを非表示
  if (!aiChatAvailable) return null;

  const handleClick = async () => {
    const settings = await loadAISettings();
    if (!settings) {
      // AI未設定時は設定ページへ遷移
      const returnTo = encodeURIComponent(location.pathname + location.search);
      navigate(`/settings/ai?returnTo=${returnTo}`);
      return;
    }
    togglePanel();
  };

  return (
    <div className="rounded-md bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500 p-[2px]">
      <button
        onClick={handleClick}
        className={`group relative flex items-center gap-1.5 rounded-[calc(0.375rem-2px)] px-3 py-2 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
          isOpen
            ? "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500 text-white shadow-sm"
            : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        }`}
        title={`${t("aiChat.title")} (Ctrl+Shift+A)`}
      >
        {/* ホバー時の背景グロー効果 (開いていない時のみ) */}
        {!isOpen && (
          <div className="absolute inset-0 rounded-[calc(0.375rem-2px)] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500 opacity-0 blur transition-opacity duration-500 group-hover:opacity-10" />
        )}

        {/* グラデーションの定義だけを行う非表示のSVG (開いていない時のみ使用) */}
        {!isOpen && (
          <svg width="0" height="0" className="absolute">
            <defs>
              <linearGradient id="ai-sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8B5CF6">
                  <animate
                    attributeName="stop-color"
                    values="#8B5CF6;#EC4899;#3B82F6;#8B5CF6"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="50%" stopColor="#EC4899">
                  <animate
                    attributeName="stop-color"
                    values="#EC4899;#3B82F6;#8B5CF6;#EC4899"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="100%" stopColor="#3B82F6">
                  <animate
                    attributeName="stop-color"
                    values="#3B82F6;#8B5CF6;#EC4899;#3B82F6"
                    dur="4s"
                    repeatCount="indefinite"
                  />
                </stop>
              </linearGradient>
            </defs>
          </svg>
        )}

        <Sparkles
          className={`relative h-6 w-6 ${isStreaming ? "animate-pulse" : ""}`}
          style={isOpen ? { stroke: "currentColor" } : { stroke: "url(#ai-sparkle-gradient)" }}
          aria-hidden="true"
        />
        <span
          className={`text-md relative font-medium ${
            !isOpen
              ? "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500 bg-clip-text text-transparent"
              : ""
          }`}
        >
          AI
        </span>
      </button>
    </div>
  );
}
