import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
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
import { ProviderSelector } from "./ProviderSelector";
import { useAISettings } from "@/hooks/useAISettings";
import { getProviderById } from "@/types/ai";
import { useToast } from "@/hooks/use-toast";

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

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast } = useToast();

  const currentProvider = getProviderById(settings.provider);

  const getSafeReturnTo = (): string | null => {
    const returnTo = searchParams.get("returnTo");
    if (!returnTo) return null;
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
    return returnTo;
  };

  const handleSave = async () => {
    const success = await save();
    if (success) {
      toast({
        title: "保存しました",
        description: "AI設定が正常に保存されました",
      });
      const returnTo = getSafeReturnTo();
      if (returnTo) {
        navigate(returnTo, { replace: true });
      }
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
        <CardTitle className="flex items-center gap-2">��� AI 設定</CardTitle>
        <CardDescription>
          LLMプロバイダーを設定して、AI機能を有効化します
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <ProviderSelector
          value={settings.provider}
          onChange={(provider) => updateSettings({ provider })}
          disabled={isSaving || isTesting}
        />

        {/* API Key Input */}
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

        {/* Model Selection */}
        <div className="space-y-2">
          <Label htmlFor="model">モデル</Label>
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
          <p className="text-xs text-muted-foreground">
            ��� 接続テスト成功後、最新のモデル一覧が反映されます
          </p>
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

        {/* API Key Help */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <h4 className="text-sm font-medium mb-2">��� APIキーの取得方法</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
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
          </ul>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving || isTesting}
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
            disabled={isSaving || isTesting || !settings.apiKey}
          >
            {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            接続テスト
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isTesting}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            保存
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
