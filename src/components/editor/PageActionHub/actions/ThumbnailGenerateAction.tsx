import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useThumbnailImageGenerate } from "@/components/editor/TiptapEditor/useThumbnailImageGenerate";
import type { PageActionComponentProps } from "../types";

/**
 * 「AI で画像生成」アクションの詳細ビュー。マウント時に画像生成 API を自動で
 * 呼び出し、成功すれば `useThumbnailImageGenerate` 内で `ctx.insertThumbnail`
 * が叩かれた後にハブを閉じる。失敗時はエラーと再試行ボタンを表示する。
 *
 * Detail view for the "thumbnail.generate" action. Auto-fires generation on
 * mount; on success `useThumbnailImageGenerate` calls `ctx.insertThumbnail`
 * internally and this component then closes the hub. On failure it shows an
 * error and a retry button.
 */
export const ThumbnailGenerateAction: React.FC<PageActionComponentProps> = ({ ctx, onClose }) => {
  const { t } = useTranslation();
  const trimmedTitle = ctx.pageTitle.trim();
  const { generateImage, isGenerating } = useThumbnailImageGenerate(
    trimmedTitle,
    ctx.isSignedIn,
    ctx.insertThumbnail,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialFireRef = useRef(false);

  const runGenerate = useCallback(async () => {
    const err = await generateImage();
    setErrorMessage(err);
    if (!err) {
      onClose();
    }
  }, [generateImage, onClose]);

  useEffect(() => {
    if (initialFireRef.current) return;
    if (!trimmedTitle) return;
    initialFireRef.current = true;
    // ユーザが詳細ビューに入った時点で 1 回だけ生成 API を叩く一回限りのキック。
    // 同期的な setState は走らず、`generateImage` の Promise 解決後に状態が
    // 更新される（cascading render は発生しない）。
    // One-shot kick: when the user opens this detail view, fire the generate
    // API exactly once. No setState runs synchronously inside this effect —
    // it only updates after the `generateImage` promise resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot kick on detail view mount, setState only after awaited fetch
    void runGenerate();
  }, [trimmedTitle, runGenerate]);

  // 表示用のエラーメッセージ。タイトル未入力時はそれをそのまま使う。
  // Resolve the error message to render: empty title falls back to the hint.
  const displayedError = !trimmedTitle
    ? t("editor.pageActionHub.actions.thumbnailGenerate.missingTitle")
    : errorMessage;

  return (
    <div className="space-y-3">
      {isGenerating && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("editor.pageActionHub.actions.thumbnailGenerate.loading")}
        </div>
      )}
      {displayedError && <div className="text-destructive text-sm">{displayedError}</div>}
      {!isGenerating && errorMessage && trimmedTitle && (
        <div>
          <Button type="button" size="sm" variant="outline" onClick={runGenerate}>
            {t("editor.pageActionHub.actions.thumbnailGenerate.retry")}
          </Button>
        </div>
      )}
    </div>
  );
};
