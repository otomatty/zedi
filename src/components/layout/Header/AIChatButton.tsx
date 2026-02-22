import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../../stores/aiChatStore';
import { useAIChatContext } from '../../../contexts/AIChatContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { loadAISettings } from '../../../lib/aiSettings';

export function AIChatButton() {
  const { t } = useTranslation();
  const { togglePanel, isStreaming } = useAIChatStore();
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
    <button
      onClick={handleClick}
      className="relative p-2 rounded-md hover:bg-accent transition-colors"
      title={`${t('aiChat.title')} (Ctrl+Shift+A)`}
    >
      <Sparkles
        className={`w-5 h-5 ${isStreaming ? 'animate-pulse text-primary' : ''}`}
      />
    </button>
  );
}
