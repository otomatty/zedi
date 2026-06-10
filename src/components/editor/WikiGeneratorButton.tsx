import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@zedi/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@zedi/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@zedi/ui";
import { WikiGeneratorStatus } from "@/hooks/wiki/useWikiGenerator";
import { isAIConfigured } from "@/lib/aiSettings";

interface WikiGeneratorButtonProps {
  title: string;
  hasContent: boolean;
  /**
   * インラインWiki生成（旧 useWikiGenerator）のコールバック。`composeHref` を
   * 渡したときは Compose 画面に遷移するため呼ばれない。Inline generation
   * callback (legacy path); skipped when `composeHref` is provided.
   */
  onGenerate: () => void;
  /** 現在の生成ステータス */
  status: WikiGeneratorStatus;
  disabled?: boolean;
  /**
   * Wiki Compose 画面の遷移先 URL。指定時はクリックで navigate し、本文ありでも
   * ボタンを表示する (Compose は追記モードをサポートするため、issue #950 U2)。
   *
   * When provided, the button navigates to the Wiki Compose split-screen UI
   * instead of calling `onGenerate`, and visibility no longer requires
   * `hasContent === false` (Compose supports the append-mode flow per #950 U2).
   */
  composeHref?: string;
}

/**
 * Wiki 生成ボタン。
 *
 * - `composeHref` 未指定（旧経路）: タイトルがあり本文が未入力のときだけ表示し、
 *   クリックで `onGenerate` を呼ぶ。
 * - `composeHref` 指定（新経路, #950）: タイトルがあれば本文有無に関わらず表示し、
 *   クリックで Compose 画面に navigate する。
 *
 * Wiki generation button.
 *
 * - Without `composeHref` (legacy): shows only when there is a title and no
 *   body content; click invokes the inline `onGenerate` callback.
 * - With `composeHref` (issue #950): shows whenever there is a title (Compose
 *   handles append vs replace internally); click navigates to the Compose UI.
 */
export const WikiGeneratorButton: React.FC<WikiGeneratorButtonProps> = ({
  title,
  hasContent,
  onGenerate,
  status,
  disabled = false,
  composeHref,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotConfiguredDialog, setShowNotConfiguredDialog] = React.useState(false);

  // タイトルがない場合は常に非表示。
  // Compose 経路では本文ありでも表示する (#950 U2: append default)。
  // 旧経路では本文ありなら非表示 (inline generation はページを上書きするため)。
  const hasTitle = title.trim() !== "";
  const shouldShowButton = composeHref ? hasTitle : hasTitle && !hasContent;

  const isGenerating = status === "generating";

  const handleClick = async () => {
    // Compose 経路: 認可チェック不要（Compose 画面で実行する）。
    // Compose path: no AI-config check; the Compose UI handles it server-side.
    if (composeHref) {
      navigate(composeHref);
      return;
    }
    // AI が利用可能か確認（api_server モードでは API キー不要）。
    // Check AI availability (no API key required in api_server mode).
    const configured = await isAIConfigured();
    if (!configured) {
      setShowNotConfiguredDialog(true);
      return;
    }

    onGenerate();
  };

  const handleGoToSettings = () => {
    setShowNotConfiguredDialog(false);
    const returnTo = `${location.pathname}${location.search}${location.hash ?? ""}`;
    const search = new URLSearchParams({ section: "ai", returnTo }).toString();
    navigate(`/settings?${search}`);
  };

  if (!shouldShowButton) {
    return null;
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={disabled || isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Wiki生成</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{composeHref ? "AI と対話しながら Wiki を作成" : "AIでWikipedia風の解説を生成"}</p>
        </TooltipContent>
      </Tooltip>

      {/* AI未設定ダイアログ */}
      <Dialog open={showNotConfiguredDialog} onOpenChange={setShowNotConfiguredDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              AI設定が必要です
            </DialogTitle>
            <DialogDescription>
              Wiki生成機能を使用するには、AI設定を完了してください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotConfiguredDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleGoToSettings}>設定画面へ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
