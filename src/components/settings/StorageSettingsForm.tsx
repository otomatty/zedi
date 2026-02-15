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
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useStorageSettings } from "@/hooks/useStorageSettings";
import {
  STORAGE_PROVIDERS,
  StorageProviderType,
  StorageProviderInfo,
  getStorageProviderById,
} from "@/types/storage";
import { useToast } from "@/hooks/use-toast";

export const StorageSettingsForm: React.FC = () => {
  const {
    settings,
    isLoading,
    isSaving,
    isTesting,
    testResult,
    updateSettings,
    updateConfig,
    save,
    test,
    reset,
  } = useStorageSettings();

  const [showSecrets, setShowSecrets] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const currentProvider = getStorageProviderById(settings.provider);
  const difficultyLabels: Record<
    StorageProviderInfo["setupDifficulty"],
    string
  > = {
    easy: "簡単",
    medium: "普通",
    hard: "上級",
  };

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
        description: "ストレージ設定が正常に保存されました",
      });
      const returnTo = getSafeReturnTo();
      if (returnTo) {
        navigate(returnTo, { replace: true });
      }
    } else {
      toast({
        title: "エラー",
        description: "ストレージ設定の保存に失敗しました",
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
      description: "ストレージ設定が初期化されました",
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
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          画像ストレージ設定
        </CardTitle>
        <CardDescription>
          デフォルトでは画像は Zedi (S3) に保存されます。ここで「使用するストレージ」を変更すると、Gyazo や Cloudflare R2 など外部ストレージに保存することもできます。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <div className="space-y-2">
          <Label htmlFor="provider">使用するストレージ</Label>
          <Select
            value={settings.provider}
            onValueChange={(value) =>
              updateSettings({ provider: value as StorageProviderType })
            }
            disabled={isSaving || isTesting}
          >
            <SelectTrigger id="provider">
              <SelectValue placeholder="ストレージを選択" />
            </SelectTrigger>
            <SelectContent>
              {STORAGE_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex flex-col items-start">
                      <span>{provider.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {provider.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        難易度: {difficultyLabels[provider.setupDifficulty]}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {provider.freeTier}
                      </Badge>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentProvider && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                難易度: {difficultyLabels[currentProvider.setupDifficulty]}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {currentProvider.freeTier}
              </Badge>
              <span>{currentProvider.description}</span>
            </div>
          )}
        </div>

        {/* Provider-specific settings */}
        {settings.provider === "s3" && (
          <Alert>
            <AlertTitle>Zedi (S3) について</AlertTitle>
            <AlertDescription>
              ログインしていれば追加の設定は不要です。画像は Zedi の標準ストレージ（S3）に保存されます。他のストレージを使う場合は上で「使用するストレージ」を変更してください。
            </AlertDescription>
          </Alert>
        )}

        {settings.provider === "gyazo" && (
          <GyazoSettings
            accessToken={settings.config.gyazoAccessToken || ""}
            onChange={(value) => updateConfig({ gyazoAccessToken: value })}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

        {settings.provider === "github" && (
          <GitHubSettings
            repository={settings.config.githubRepository || ""}
            token={settings.config.githubToken || ""}
            branch={settings.config.githubBranch || "main"}
            path={settings.config.githubPath || "images"}
            onChange={(updates) => updateConfig(updates)}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

        {settings.provider === "cloudflare-r2" && (
          <CloudflareR2Settings
            bucket={settings.config.r2Bucket || ""}
            accountId={settings.config.r2AccountId || ""}
            accessKeyId={settings.config.r2AccessKeyId || ""}
            secretAccessKey={settings.config.r2SecretAccessKey || ""}
            publicUrl={settings.config.r2PublicUrl || ""}
            onChange={(updates) => updateConfig(updates)}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

        {settings.provider === "google-drive" && (
          <GoogleDriveSettings
            clientId={settings.config.googleDriveClientId || ""}
            clientSecret={settings.config.googleDriveClientSecret || ""}
            accessToken={settings.config.googleDriveAccessToken || ""}
            refreshToken={settings.config.googleDriveRefreshToken || ""}
            folderId={settings.config.googleDriveFolderId || ""}
            onChange={(updates) => updateConfig(updates)}
            showSecrets={showSecrets}
            setShowSecrets={setShowSecrets}
            disabled={isSaving || isTesting}
          />
        )}

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
            <AlertDescription>
              {testResult.message}
              {testResult.error && (
                <span className="block text-xs mt-1">{testResult.error}</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Setup Guide Link (外部ストレージのみ) */}
        {currentProvider && currentProvider.helpUrl && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">💡 セットアップガイド</h4>
            <a
              href={currentProvider.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {currentProvider.name}の設定方法 <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
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
                保存されている認証情報とすべての設定が削除されます。この操作は取り消せません。
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
            disabled={isSaving || isTesting}
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

// Gyazo Settings Component
interface GyazoSettingsProps {
  accessToken: string;
  onChange: (value: string) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GyazoSettings: React.FC<GyazoSettingsProps> = ({
  accessToken,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => (
  <div className="space-y-2">
    <Label htmlFor="gyazoAccessToken">Access Token</Label>
    <div className="relative">
      <Input
        id="gyazoAccessToken"
        type={showSecrets ? "text" : "password"}
        value={accessToken}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Gyazo Access Token"
        disabled={disabled}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
        onClick={() => setShowSecrets(!showSecrets)}
      >
        {showSecrets ? (
          <EyeOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Eye className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      <a
        href="https://gyazo.com/oauth/applications"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        Gyazo OAuth Applications
      </a>
      でAccess Tokenを取得してください
    </p>
    <div className="rounded-lg border border-border bg-muted/50 p-3 mt-2">
      <p className="text-xs font-medium mb-1">💡 Callback URLの設定について</p>
      <p className="text-xs text-muted-foreground">
        OAuthアプリケーション作成時にCallback URLが求められる場合、以下のいずれかを入力してください（実際には使用されません）:
      </p>
      <ul className="text-xs text-muted-foreground mt-1 ml-4 list-disc space-y-0.5">
        <li><code className="bg-muted px-1 rounded">http://localhost:5173/callback</code></li>
        <li><code className="bg-muted px-1 rounded">urn:ietf:wg:oauth:2.0:oob</code></li>
        <li><code className="bg-muted px-1 rounded">zedi://oauth/callback</code></li>
      </ul>
    </div>
  </div>
);

// GitHub Settings Component
interface GitHubSettingsProps {
  repository: string;
  token: string;
  branch: string;
  path: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GitHubSettings: React.FC<GitHubSettingsProps> = ({
  repository,
  token,
  branch,
  path,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="githubRepository">リポジトリ</Label>
      <Input
        id="githubRepository"
        type="text"
        value={repository}
        onChange={(e) => onChange({ githubRepository: e.target.value })}
        placeholder="username/repo-name"
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        画像保存用のリポジトリを "owner/repo" 形式で入力
      </p>
    </div>

    <div className="space-y-2">
      <Label htmlFor="githubToken">Personal Access Token</Label>
      <div className="relative">
        <Input
          id="githubToken"
          type={showSecrets ? "text" : "password"}
          value={token}
          onChange={(e) => onChange({ githubToken: e.target.value })}
          placeholder="ghp_..."
          disabled={disabled}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowSecrets(!showSecrets)}
        >
          {showSecrets ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="githubBranch">ブランチ</Label>
        <Input
          id="githubBranch"
          type="text"
          value={branch}
          onChange={(e) => onChange({ githubBranch: e.target.value })}
          placeholder="main"
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="githubPath">保存先パス</Label>
        <Input
          id="githubPath"
          type="text"
          value={path}
          onChange={(e) => onChange({ githubPath: e.target.value })}
          placeholder="images"
          disabled={disabled}
        />
      </div>
    </div>
  </div>
);

// Cloudflare R2 Settings Component
interface CloudflareR2SettingsProps {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const CloudflareR2Settings: React.FC<CloudflareR2SettingsProps> = ({
  bucket,
  accountId,
  accessKeyId,
  secretAccessKey,
  publicUrl,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="r2Bucket">バケット名</Label>
        <Input
          id="r2Bucket"
          type="text"
          value={bucket}
          onChange={(e) => onChange({ r2Bucket: e.target.value })}
          placeholder="my-bucket"
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="r2AccountId">Account ID</Label>
        <Input
          id="r2AccountId"
          type="text"
          value={accountId}
          onChange={(e) => onChange({ r2AccountId: e.target.value })}
          placeholder="Cloudflare Account ID"
          disabled={disabled}
        />
      </div>
    </div>

    <div className="space-y-2">
      <Label htmlFor="r2AccessKeyId">Access Key ID</Label>
      <Input
        id="r2AccessKeyId"
        type="text"
        value={accessKeyId}
        onChange={(e) => onChange({ r2AccessKeyId: e.target.value })}
        placeholder="Access Key ID"
        disabled={disabled}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="r2SecretAccessKey">Secret Access Key</Label>
      <div className="relative">
        <Input
          id="r2SecretAccessKey"
          type={showSecrets ? "text" : "password"}
          value={secretAccessKey}
          onChange={(e) => onChange({ r2SecretAccessKey: e.target.value })}
          placeholder="Secret Access Key"
          disabled={disabled}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowSecrets(!showSecrets)}
        >
          {showSecrets ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>

    <div className="space-y-2">
      <Label htmlFor="r2PublicUrl">公開URL（オプション）</Label>
      <Input
        id="r2PublicUrl"
        type="text"
        value={publicUrl}
        onChange={(e) => onChange({ r2PublicUrl: e.target.value })}
        placeholder="https://your-domain.com"
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        カスタムドメインを使用する場合に入力
      </p>
    </div>
  </div>
);

// Google Drive Settings Component
interface GoogleDriveSettingsProps {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  folderId: string;
  onChange: (updates: Record<string, string>) => void;
  showSecrets: boolean;
  setShowSecrets: (show: boolean) => void;
  disabled: boolean;
}

const GoogleDriveSettings: React.FC<GoogleDriveSettingsProps> = ({
  clientId,
  clientSecret,
  accessToken,
  refreshToken,
  folderId,
  onChange,
  showSecrets,
  setShowSecrets,
  disabled,
}) => (
  <div className="space-y-4">
    <Alert>
      <AlertTitle>⚠️ OAuth2認証が必要です</AlertTitle>
      <AlertDescription className="text-xs">
        Google Driveを使用するには、OAuth2認証の設定が必要です。
        <a
          href="https://console.cloud.google.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline ml-1"
        >
          Google Cloud Console
        </a>
        でAPIを有効化し、認証情報を取得してください。
      </AlertDescription>
    </Alert>

    <div className="space-y-2">
      <Label htmlFor="googleDriveClientId">Client ID</Label>
      <Input
        id="googleDriveClientId"
        type="text"
        value={clientId}
        onChange={(e) => onChange({ googleDriveClientId: e.target.value })}
        placeholder="Client ID"
        disabled={disabled}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="googleDriveClientSecret">Client Secret</Label>
      <div className="relative">
        <Input
          id="googleDriveClientSecret"
          type={showSecrets ? "text" : "password"}
          value={clientSecret}
          onChange={(e) => onChange({ googleDriveClientSecret: e.target.value })}
          placeholder="Client Secret"
          disabled={disabled}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowSecrets(!showSecrets)}
        >
          {showSecrets ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>

    <div className="space-y-2">
      <Label htmlFor="googleDriveAccessToken">Access Token</Label>
      <Input
        id="googleDriveAccessToken"
        type={showSecrets ? "text" : "password"}
        value={accessToken}
        onChange={(e) => onChange({ googleDriveAccessToken: e.target.value })}
        placeholder="Access Token"
        disabled={disabled}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="googleDriveRefreshToken">Refresh Token</Label>
      <Input
        id="googleDriveRefreshToken"
        type={showSecrets ? "text" : "password"}
        value={refreshToken}
        onChange={(e) => onChange({ googleDriveRefreshToken: e.target.value })}
        placeholder="Refresh Token"
        disabled={disabled}
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="googleDriveFolderId">フォルダID（オプション）</Label>
      <Input
        id="googleDriveFolderId"
        type="text"
        value={folderId}
        onChange={(e) => onChange({ googleDriveFolderId: e.target.value })}
        placeholder="保存先フォルダのID"
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        特定のフォルダに保存する場合に入力
      </p>
    </div>
  </div>
);
