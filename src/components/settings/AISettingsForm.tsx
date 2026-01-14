import React, { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Download,
  Cpu,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProviderSelector } from "./ProviderSelector";
import { useAISettings } from "@/hooks/useAISettings";
import {
  getProviderById,
  OLLAMA_MODELS,
  getOllamaModelInfo,
  type OllamaModelInfo,
} from "@/types/ai";
import { downloadOllamaModel } from "@/lib/aiClient";
import { useToast } from "@/hooks/use-toast";

// Ollamaモデルカテゴリの表示名
const CATEGORY_LABELS: Record<OllamaModelInfo["category"], string> = {
  lightweight: "軽量 (8GB RAM以下)",
  balanced: "バランス (16GB RAM)",
  "high-performance": "高性能 (32GB+ RAM)",
};

export const AISettingsForm: React.FC = () => {
  const {
    settings,
    availableModels,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings,
    save,
    test,
    reset,
  } = useAISettings();

  const [showApiKey, setShowApiKey] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    status: string;
    percentage: number;
  } | null>(null);
  const { toast } = useToast();

  const currentProvider = getProviderById(settings.provider);
  const isOllama = settings.provider === "ollama";

  // Ollamaモデル情報を取得
  const selectedModelInfo = isOllama
    ? getOllamaModelInfo(settings.model)
    : null;

  // Ollamaエンドポイントのデフォルト値を設定
  useEffect(() => {
    if (isOllama && !settings.ollamaEndpoint) {
      updateSettings({ ollamaEndpoint: "http://localhost:11434" });
    }
  }, [isOllama, settings.ollamaEndpoint, updateSettings]);

  const handleSave = async () => {
    const success = await save();
    if (success) {
      toast({
        title: "保存しました",
        description: "AI設定が正常に保存されました",
      });
    } else {
      toast({
        title: "エラー",
        description: "AI設定の保存に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleTest = async () => {
    const result = await test();
    if (result.success) {
      toast({
        title: "接続成功",
        description: result.message,
      });
    } else {
      toast({
        title: "接続失敗",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    reset();
    toast({
      title: "リセットしました",
      description: "AI設定が初期化されました",
    });
  };

  const handleDownloadModel = async () => {
    if (!isOllama || !settings.model) return;

    setIsDownloading(true);
    setDownloadProgress({ status: "開始中...", percentage: 0 });

    try {
      await downloadOllamaModel(
        settings.model,
        settings.ollamaEndpoint,
        (status, completed, total) => {
          const percentage =
            completed && total ? Math.round((completed / total) * 100) : 0;
          setDownloadProgress({ status, percentage });
        },
      );

      toast({
        title: "ダウンロード完了",
        description: `${settings.model} のダウンロードが完了しました`,
      });

      // テストを実行してモデル一覧を更新
      await test();
    } catch (error) {
      toast({
        title: "ダウンロード失敗",
        description:
          error instanceof Error ? error.message : "エラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">🤖 AI 設定</CardTitle>
        <CardDescription>
          LLMプロバイダーを設定して、AI機能を有効化します
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <ProviderSelector
          value={settings.provider}
          onChange={(provider) => updateSettings({ provider })}
          disabled={isSaving || isTesting || isDownloading}
        />

        {/* Ollama Security Notice */}
        {isOllama && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <Shield className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700">
              ローカル実行モード
            </AlertTitle>
            <AlertDescription className="text-green-600">
              Ollamaはローカルで実行されます。データは外部に送信されないため、社内の機密情報も安全に処理できます。
            </AlertDescription>
          </Alert>
        )}

        {/* Ollama Endpoint (only for Ollama) */}
        {isOllama && (
          <div className="space-y-2">
            <Label htmlFor="ollamaEndpoint">Ollama エンドポイント</Label>
            <Input
              id="ollamaEndpoint"
              type="text"
              value={settings.ollamaEndpoint || "http://localhost:11434"}
              onChange={(e) =>
                updateSettings({ ollamaEndpoint: e.target.value })
              }
              placeholder="http://localhost:11434"
              disabled={isSaving || isTesting || isDownloading}
            />
            <p className="text-xs text-muted-foreground">
              通常はデフォルト値のままで問題ありません
            </p>
          </div>
        )}

        {/* API Key Input (not for Ollama) */}
        {!isOllama && (
          <div className="space-y-2">
            <Label htmlFor="apiKey">API キー</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => updateSettings({ apiKey: e.target.value })}
                placeholder={currentProvider?.placeholder}
                disabled={isSaving || isTesting}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Model Selection */}
        <div className="space-y-2">
          <Label htmlFor="model">モデル</Label>
          {isOllama ? (
            <div className="space-y-3">
              {/* カテゴリ別モデル選択 */}
              {(["lightweight", "balanced", "high-performance"] as const).map(
                (category) => {
                  const categoryModels = OLLAMA_MODELS.filter(
                    (m) => m.category === category,
                  );
                  if (categoryModels.length === 0) return null;

                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {CATEGORY_LABELS[category]}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 pl-6">
                        {categoryModels.map((model) => (
                          <button
                            key={model.name}
                            type="button"
                            onClick={() =>
                              updateSettings({ model: model.name })
                            }
                            disabled={isSaving || isTesting || isDownloading}
                            className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                              settings.model === model.name
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {model.displayName}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {model.parameterSize}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {model.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                推奨RAM: {model.recommendedRAM}GB
                              </p>
                            </div>
                            {settings.model === model.name && (
                              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}

              {/* モデルダウンロード */}
              {settings.model && (
                <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        選択中:{" "}
                        {selectedModelInfo?.displayName || settings.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        モデルがインストールされていない場合はダウンロードしてください
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadModel}
                      disabled={isSaving || isTesting || isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      ダウンロード
                    </Button>
                  </div>

                  {/* ダウンロード進捗 */}
                  {downloadProgress && (
                    <div className="mt-3 space-y-2">
                      <Progress value={downloadProgress.percentage} />
                      <p className="text-xs text-muted-foreground">
                        {downloadProgress.status}{" "}
                        {downloadProgress.percentage > 0 &&
                          `(${downloadProgress.percentage}%)`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Select
              value={settings.model}
              onValueChange={(model) => updateSettings({ model })}
              disabled={isSaving || isTesting}
            >
              <SelectTrigger id="model">
                <SelectValue placeholder="モデルを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!isOllama && (
            <p className="text-xs text-muted-foreground">
              💡 接続テスト成功後、最新のモデル一覧が反映されます
            </p>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            <AlertTitle>
              {testResult.success ? "接続成功" : "接続失敗"}
            </AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* API Key Help / Ollama Setup Help */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          {isOllama ? (
            <>
              <h4 className="text-sm font-medium mb-2">
                💡 Ollamaのセットアップ
              </h4>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>
                  <a
                    href="https://ollama.ai/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Ollamaをダウンロード <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  ターミナルで{" "}
                  <code className="bg-muted px-1 rounded">ollama serve</code>{" "}
                  を実行
                </li>
                <li>上のリストからモデルを選択してダウンロード</li>
                <li>「接続テスト」をクリックして確認</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                ※ 初回ダウンロードには数GB〜数十GBの容量と時間が必要です
              </p>
            </>
          ) : (
            <>
              <h4 className="text-sm font-medium mb-2">💡 APIキーの取得方法</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    OpenAI <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Anthropic <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Google AI Studio <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving || isTesting || isDownloading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              リセット
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>設定をリセットしますか？</AlertDialogTitle>
              <AlertDialogDescription>
                保存されているAPIキーとすべての設定が削除されます。この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>
                リセット
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={
              isSaving ||
              isTesting ||
              isDownloading ||
              (!isOllama && !settings.apiKey)
            }
          >
            {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            接続テスト
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isTesting || isDownloading}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            保存
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
