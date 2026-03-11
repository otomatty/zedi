import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../../stores/aiChatStore";
import { useAIChatContext } from "../../../contexts/AIChatContext";
import { useNavigate, useLocation } from "react-router-dom";
import { loadAISettings } from "../../../lib/aiSettings";
import { Sparkles } from "lucide-react";

const AI_BUTTON_GRADIENT = "from-violet-500 via-fuchsia-500 to-blue-500";

export function AIChatButton() {
  const { t } = useTranslation();
  const { isOpen, togglePanel, isStreaming } = useAIChatStore();
  const { aiChatAvailable } = useAIChatContext();
  const navigate = useNavigate();
  const location = useLocation();
  const gradientId = useId().replaceAll(":", "");

  // AIチャットが利用できないページではボタンを非表示
  if (!aiChatAvailable) return null;

  const handleClick = async () => {
    const settings = await loadAISettings();
    if (!settings) {
      // AI未設定時は設定ページへ遷移
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/settings?${new URLSearchParams({ section: "ai", returnTo }).toString()}`);
      return;
    }
    togglePanel();
  };

  return (
    <div
      className={`flex h-10 shrink-0 items-center rounded-md bg-gradient-to-r ${AI_BUTTON_GRADIENT} p-[2px] transition-shadow duration-300 hover:shadow-[0_0_12px_-2px_rgba(139,92,246,0.35)]`}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={t("aiChat.title")}
        aria-pressed={isOpen}
        className={`group relative flex h-full min-h-0 w-full items-center justify-center gap-1 rounded-[calc(theme(borderRadius.md)-1px)] px-3 transition-colors duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
          isOpen
            ? `bg-gradient-to-r ${AI_BUTTON_GRADIENT} text-white shadow-md`
            : "bg-background text-muted-foreground hover:text-white"
        }`}
        title={`${t("aiChat.title")} (Ctrl+Shift+A)`}
      >
        {/* ホバー時: オープン時と同じグラデーション背景を透過で重ねて滑らかに表示 */}
        {!isOpen && (
          <div
            className={`pointer-events-none absolute inset-0 rounded-[calc(theme(borderRadius.md)-1px)] bg-gradient-to-r ${AI_BUTTON_GRADIENT} opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100`}
            aria-hidden
          />
        )}

        {/* グラデーションの定義だけを行う非表示のSVG (開いていない時のみ使用) */}
        {!isOpen && (
          <svg width="0" height="0" className="absolute">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
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

        {isOpen ? (
          <Sparkles
            className={`relative h-6 w-6 ${isStreaming ? "animate-pulse" : ""}`}
            style={{ stroke: "currentColor" }}
            aria-hidden="true"
          />
        ) : (
          <span className="relative inline-block h-6 w-6">
            <Sparkles
              className="h-6 w-6 opacity-100 transition-opacity duration-300 ease-out group-hover:opacity-0"
              style={{ stroke: `url(#${gradientId})` }}
              aria-hidden="true"
            />
            <Sparkles
              className={`absolute inset-0 h-6 w-6 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 ${isStreaming ? "animate-pulse" : ""}`}
              style={{ stroke: "currentColor" }}
              aria-hidden="true"
            />
          </span>
        )}
        <span
          className={`text-md relative bg-transparent font-medium transition-colors duration-300 ease-out ${
            !isOpen ? "text-muted-foreground group-hover:text-white" : ""
          }`}
        >
          AI
        </span>
      </button>
    </div>
  );
}
