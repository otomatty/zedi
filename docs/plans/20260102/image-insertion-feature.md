# 実装計画書: 画像挿入機能

## 概要

| 項目       | 内容                                                              |
| :--------- | :---------------------------------------------------------------- |
| **機能名** | 画像挿入機能                                                      |
| **目的**   | エディタに画像を挿入し、外部ストレージに保存して表示する          |
| **優先度** | 🔴 必須（コア機能）                                               |
| **依存**   | Tiptap Image拡張、外部ストレージ統合                              |

---

## 設計方針

### ストレージ戦略

- **本体ではストレージを持たない**: Zedi本体は画像ファイルを保存しない
- **ユーザー自身のストレージを使用**: ユーザーが自分のストレージアカウントを選択・連携して使用
- **柔軟なストレージ選択**: ユーザーが所有・管理する任意のストレージサービスを選択可能
- **画像URLのみ保存**: データベースには画像のURLのみを保存（`content`フィールドのTiptap JSON内）
- **プライバシー重視**: ユーザーの画像はユーザー自身のストレージに保存され、Zediは一切保存しない

### UX原則

- **複数の挿入方法**: ユーザーが最も使いやすい方法を選択できる
- **即座のフィードバック**: アップロード中もプレビューを表示
- **シームレスな統合**: 既存のエディタ体験を損なわない
- **オフライン対応**: 可能な限りオフラインでも動作

---

## 機能要件

### 1. 外部ストレージ統合

#### 基本方針

- **ユーザー自身のストレージアカウント**: ユーザーが所有・管理するストレージサービスを選択
- **自由な選択**: ユーザーが使い慣れたストレージサービスを選択可能
- **簡単な連携**: 設定画面で認証情報を入力するだけで連携完了
- **複数ストレージ対応（将来拡張）**: 将来的には複数のストレージを登録して選択可能に

#### サポート対象ストレージ（MVP版）

実装コストを抑えるため、最初のバージョンでは以下のストレージサービスのみをサポートします：

| ストレージタイプ | 説明                           | 認証方式                     | セットアップ難易度 | 無料プラン |
| :-------------- | :----------------------------- | :--------------------------- | :---------------- | :--------- |
| **Google Drive** | Google Drive API | OAuth2認証（Client ID + Client Secret） | 中（OAuth2設定が必要） | ✅ 15GB無料 |
| **Imgur**       | Imgur API                      | Client IDのみ                 | 低（Client IDのみ） | ✅ 無料 |
| **Cloudflare R2** | Cloudflare R2 バケット         | Access Key ID + Secret Key   | 低（無料枠あり） | ✅ 10GB/月無料 |
| **GitHub**      | GitHub Repository              | Personal Access Token        | 低（Tokenのみ） | ✅ 無料 |

**選択理由**:
- **Google Drive**: 多くのユーザーが既にアカウントを持っており、15GBの無料容量がある
- **Imgur**: Client IDのみでセットアップ可能、最も簡単
- **Cloudflare R2**: 無料枠が大きく（10GB/月）、S3互換で実装が簡単
- **GitHub**: 開発者には馴染みがあり、Personal Access Tokenのみで簡単

**将来の拡張**:
MVP版の実装が完了した後、必要に応じて以下のストレージを追加可能：
- AWS S3、Dropbox、OneDrive、その他のS3互換ストレージ等

#### ストレージ設定UI

**設定画面（Settings）に追加**

ユーザーが自分のストレージアカウントを選択・設定する画面：

```
┌─────────────────────────────────────────────────────────────┐
│  設定                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📸 画像ストレージ設定                                       │
│                                                             │
│  💡 画像はあなた自身のストレージアカウントに保存されます。  │
│     Zediは画像を保存しません。                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 使用するストレージ: [選択してください ▼]            │   │
│  │                                                      │   │
│  │  • Google Drive                                    │   │
│  │  • Imgur                                           │   │
│  │  • Cloudflare R2                                   │   │
│  │  • GitHub                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ──────────────────────────────────────────────────────     │
│                                                             │
│  [選択したストレージの設定フォーム]                         │
│                                                             │
│  例: Cloudflare R2 を選択した場合                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ バケット名: [あなたのバケット名]                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Access Key ID: [あなたのAccess Key ID]              │   │
│  │ 🔗 Cloudflare R2のAccess Key IDを取得               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Secret Access Key: [••••••••]                       │   │
│  │ 🔗 Cloudflare R2のSecret Access Keyを取得            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ エンドポイントURL: [https://...]                     │   │
│  │ （オプション）                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  💡 認証情報は暗号化してローカルに保存されます。            │
│     あなたのストレージアカウント情報はZediのサーバーに      │
│     送信されることはありません。                            │
│                                                             │
│  [接続テスト]  [保存]  [削除]                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**各ストレージタイプの設定項目**

- **Google Drive**:
  - OAuth2認証（初回認証時にブラウザでログイン）
  - Client ID（Google Cloud Consoleで取得）
  - Client Secret（Google Cloud Consoleで取得）
  - フォルダID（オプション、特定のフォルダに保存する場合）
  - 💡 セットアップガイド: [Google Drive API設定方法](#google-drive-setup-guide)

- **Imgur**:
  - Client ID（Imgur App登録で取得、無料）
  - 💡 セットアップガイド: [Imgur API設定方法](#imgur-setup-guide)

- **Cloudflare R2**:
  - バケット名
  - Access Key ID
  - Secret Access Key
  - エンドポイントURL（自動取得）
  - 💡 セットアップガイド: [Cloudflare R2設定方法](#cloudflare-r2-setup-guide)

- **GitHub**:
  - リポジトリ（owner/repo形式）
  - Personal Access Token（GitHub Settings > Developer settings > Personal access tokens）
  - ブランチ（デフォルト: main）
  - 💡 セットアップガイド: [GitHub設定方法](#github-setup-guide)

#### ストレージ設定の保存

- **保存場所**: `localStorage`（AI設定と同様の方式）
- **暗号化**: 認証情報（API Key、Secret Key等）は暗号化して保存
- **型定義**: `src/types/storage.ts` に設定型を定義

```typescript
export type StorageProviderType = 
  | "google-drive"
  | "imgur"
  | "cloudflare-r2"
  | "github";

export interface StorageSettings {
  provider: StorageProviderType;
  // プロバイダー固有の設定
  config: StorageProviderConfig;
  isConfigured: boolean;
  // ユーザーが設定したストレージの名前（オプション、将来の複数ストレージ対応用）
  name?: string;
}

export interface StorageProviderConfig {
  // Google Drive
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  googleDriveAccessToken?: string; // OAuth2認証後に取得
  googleDriveRefreshToken?: string; // OAuth2認証後に取得
  googleDriveFolderId?: string; // 保存先フォルダID（オプション）
  
  // Imgur
  imgurClientId?: string;
  
  // Cloudflare R2
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Endpoint?: string; // 自動取得されるが、カスタムエンドポイントも可能
  
  // GitHub
  githubRepository?: string; // "owner/repo"形式
  githubToken?: string;
  githubBranch?: string;
}
```

#### OAuth2認証の実装（Google Drive、Dropbox、OneDrive）

これらのサービスはOAuth2認証が必要です：

1. **初回認証フロー**:
   - ユーザーがストレージタイプを選択（例: Google Drive）
   - Client ID / App Keyを入力
   - 「認証」ボタンをクリック
   - ブラウザでOAuth2認証画面が開く
   - ユーザーがログインして権限を許可
   - 認証コードが返され、Access TokenとRefresh Tokenを取得
   - トークンを暗号化してローカルに保存

2. **トークンの更新**:
   - Access Tokenは有効期限があるため、Refresh Tokenを使用して自動更新
   - アップロード時にトークンが期限切れの場合は自動的に更新

3. **認証状態の管理**:
   - 認証状態をローカルに保存
   - アプリ起動時に認証状態を確認
   - 必要に応じて再認証を促す

#### ストレージ接続テスト

- **接続テストボタン**: 設定画面でユーザーのストレージアカウントへの接続をテスト
- **テスト方法**: 小さなテスト画像をアップロードして確認
- **エラーハンドリング**: 接続失敗時は具体的なエラーメッセージを表示
- **認証情報の検証**: 入力された認証情報が正しいか確認
- **権限の確認**: 必要な権限（読み取り/書き込み）があるか確認
- **OAuth2認証**: Google Drive、Dropbox、OneDriveの場合は認証フローを実行

#### ストレージ設定の管理

- **設定の保存**: ユーザーが入力した認証情報は暗号化してローカルに保存
- **設定の削除**: ユーザーが設定を削除できる
- **設定の変更**: ユーザーがいつでも設定を変更できる
- **プライバシー**: 認証情報はZediのサーバーに送信されない（完全にクライアントサイドで処理）

### 2. 画像挿入方法

#### 方法1: ツールバーボタン

**エディタツールバーに画像ボタンを追加**

```
┌─────────────────────────────────────────────────────────────┐
│  [B] [I] [U] [📷] [🔗] [📊]                                 │
└─────────────────────────────────────────────────────────────┘
```

- **クリック**: ファイル選択ダイアログを開く
- **複数選択対応**: 複数の画像を一度に選択可能
- **キーボードショートカット**: `Cmd/Ctrl + Shift + I`

#### 方法2: ドラッグ&ドロップ

- **エディタ内へのドロップ**: 画像ファイルをエディタにドラッグ&ドロップ
- **視覚的フィードバック**: ドロップ可能な領域をハイライト表示
- **複数ファイル対応**: 複数の画像を一度にドロップ可能
- **カーソル位置に挿入**: ドロップ位置に画像を挿入

#### 方法3: クリップボードからのペースト

- **画像のペースト**: `Cmd/Ctrl + V` でクリップボードの画像を貼り付け
- **スクリーンショット対応**: スクリーンショットを直接貼り付け可能
- **ブラウザからのコピー**: ブラウザで画像をコピーして貼り付け可能

#### 方法4: URL入力

- **画像URLの貼り付け**: 画像URLをペーストすると自動的に画像として挿入
- **URL検証**: 有効な画像URLかどうかを検証
- **外部ストレージへのアップロード**: URLの画像を外部ストレージにアップロード（オプション）

#### 方法5: 選択メニューからの挿入

**テキスト選択時のメニューに画像挿入オプションを追加**

```
┌─────────────────────────────────────────────────────────────┐
│  [ダイアグラム生成] [画像を挿入]                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. 画像アップロードフロー

#### アップロードプロセス

```
1. ユーザーが画像を選択/ドロップ/ペースト
   ↓
2. 画像をプレビュー表示（即座に）
   ↓
3. ユーザー自身のストレージ設定を確認
   - 未設定の場合: 設定画面への導線を表示（「あなたのストレージを設定してください」）
   - 設定済みの場合: アップロード開始
   ↓
4. 画像をリサイズ/最適化（オプション）
   ↓
5. ユーザー自身のストレージアカウントにアップロード
   - ユーザーが設定したストレージサービスに直接アップロード
   - Zediのサーバーを経由しない（完全にクライアントサイド）
   ↓
6. アップロードされたURLを取得
   - ユーザーのストレージから返されたURL
   ↓
7. Tiptap Imageノードとしてエディタに挿入
   - 画像URLのみをデータベースに保存
```

#### アップロード中の表示

- **プレースホルダー表示**: アップロード中も画像をプレビュー表示
- **プログレスインジケーター**: アップロード進捗を表示
- **エラー処理**: アップロード失敗時はエラーメッセージを表示

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                           │
│  │              │                                           │
│  │  [画像プレビュー]                                         │
│  │              │                                           │
│  │  ⏳ アップロード中... 75%                                 │
│  │              │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 4. 画像表示と編集

#### 画像ノードの表示

- **レスポンシブ表示**: 画像は最大幅100%で表示
- **アスペクト比の維持**: 画像のアスペクト比を維持
- **遅延読み込み**: 画像は必要に応じて読み込む（Lazy Loading）

#### 画像の編集機能

**画像をクリック/選択した際に表示されるメニュー**

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                           │
│  │              │                                           │
│  │  [画像]                                                   │
│  │              │                                           │
│  └──────────────┘                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [サイズ変更] [代替テキスト] [削除] [URLをコピー]     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- **サイズ変更**: 画像のサイズを調整（小/中/大/フル幅）
- **代替テキスト**: アクセシビリティのためのalt属性を編集
- **削除**: 画像を削除（ストレージからの削除はオプション）
- **URLをコピー**: 画像URLをクリップボードにコピー

#### 画像のリサイズ

- **ドラッグハンドル**: 画像の角をドラッグしてリサイズ
- **固定サイズオプション**: 小/中/大/フル幅のプリセットサイズ
- **アスペクト比の維持**: リサイズ時もアスペクト比を維持

### 5. エラーハンドリング

#### ストレージ未設定時

- **設定画面への導線**: 画像挿入時に設定画面へのリンクを表示
  - メッセージ: 「画像をアップロードするには、あなた自身のストレージアカウントを設定してください」
- **一時的な保存**: 未設定時はBase64エンコードで一時保存（オプション）
  - 注意: Base64はデータベースサイズが大きくなるため、推奨しない
  - ユーザーにストレージ設定を促す

#### アップロード失敗時

- **エラーメッセージ**: 具体的なエラーメッセージを表示
  - 認証エラー: 「ストレージアカウントの認証情報を確認してください」
  - 権限エラー: 「ストレージアカウントに書き込み権限があるか確認してください」
  - ネットワークエラー: 「ネットワーク接続を確認してください」
- **リトライ機能**: アップロード失敗時にリトライボタンを表示
- **設定確認**: ストレージ設定画面へのリンクを表示
- **フォールバック**: 可能な場合は別の方法を提案

#### 画像読み込み失敗時

- **プレースホルダー**: 画像が読み込めない場合はプレースホルダーを表示
- **エラーアイコン**: 読み込み失敗を示すアイコンを表示
- **URL表示**: 画像URLを表示してユーザーが確認できるようにする

---

## 技術的な実装要件

### 1. Tiptap Image拡張の追加

#### パッケージインストール

```bash
bun add @tiptap/extension-image
```

#### エディタ設定への追加

**ファイル**: `src/components/editor/TiptapEditor/editorConfig.ts`

```typescript
import Image from "@tiptap/extension-image";

export function createEditorExtensions(
  options: EditorExtensionsOptions
): Extension[] {
  return [
    // ... 既存の拡張
    Image.configure({
      inline: true,
      allowBase64: false, // 外部ストレージを使用するためBase64は無効化
      HTMLAttributes: {
        class: "tiptap-image",
      },
    }),
  ];
}
```

#### サポートノードタイプへの追加

**ファイル**: `src/lib/contentUtils.ts`

```typescript
const SUPPORTED_NODE_TYPES = new Set([
  // ... 既存のノードタイプ
  'image', // 追加
]);
```

### 2. ストレージプロバイダーの実装

#### ストレージプロバイダーインターフェース

**ファイル**: `src/lib/storage/types.ts`

```typescript
export interface StorageProvider {
  // 画像をアップロードしてURLを返す
  uploadImage(file: File, options?: UploadOptions): Promise<string>;
  
  // 画像を削除（オプション）
  deleteImage(url: string): Promise<void>;
  
  // 接続テスト
  testConnection(): Promise<boolean>;
  
  // プロバイダー名
  name: string;
}
```

#### プロバイダー実装

各ストレージプロバイダーを個別に実装（ユーザーが自分のアカウントで使用）：

**MVP版で実装するプロバイダー**:

- `src/lib/storage/providers/GoogleDriveProvider.ts` - ユーザー自身のGoogle Driveアカウント（OAuth2認証）
- `src/lib/storage/providers/ImgurProvider.ts` - ユーザー自身のImgurアカウント（最も簡単）
- `src/lib/storage/providers/CloudflareR2Provider.ts` - ユーザー自身のCloudflare R2アカウント（無料枠あり）
- `src/lib/storage/providers/GitHubProvider.ts` - ユーザー自身のGitHubアカウント（開発者向け）

### 3. 画像アップロードフック

**ファイル**: `src/hooks/useImageUpload.ts`

```typescript
export function useImageUpload() {
  const { storageSettings } = useStorageSettings();
  
  const uploadImage = async (file: File): Promise<string> => {
    // ユーザーのストレージ設定の確認
    if (!storageSettings?.isConfigured) {
      throw new Error("ストレージが設定されていません。設定画面でストレージを設定してください。");
    }
    
    // ユーザーが選択したストレージのプロバイダーを取得
    const provider = getStorageProvider(storageSettings);
    
    // ユーザー自身のストレージアカウントにアップロード
    return await provider.uploadImage(file);
  };
  
  return { uploadImage };
}
```

### 4. エディタへの統合

#### ドラッグ&ドロップハンドラー

**ファイル**: `src/components/editor/TiptapEditor.tsx`

```typescript
const editor = useEditor({
  // ... 既存の設定
  editorProps: {
    ...defaultEditorProps,
    handleDrop: (view, event, slice, moved) => {
      // 画像ファイルのドロップ処理
      if (!moved && event.dataTransfer?.files?.length) {
        const files = Array.from(event.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length > 0) {
          event.preventDefault();
          handleImageUpload(imageFiles);
          return true;
        }
      }
      return false;
    },
    handlePaste: (view, event, slice) => {
      // クリップボードからの画像ペースト処理
      const items = Array.from(event.clipboardData?.items || []);
      const imageItems = items.filter(item => item.type.startsWith('image/'));
      
      if (imageItems.length > 0) {
        event.preventDefault();
        handleImagePaste(imageItems);
        return true;
      }
      return false;
    },
  },
});
```

#### ツールバーボタン

**ファイル**: `src/components/editor/TiptapEditorToolbar.tsx`（新規作成）

```typescript
const ImageButton = () => {
  const { uploadImage } = useImageUpload();
  const editor = useEditor();
  
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const imageFiles = Array.from(files).filter(file => 
        file.type.startsWith('image/')
      );
      await handleImageUpload(imageFiles);
    }
  };
  
  return (
    <label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageSelect}
        style={{ display: 'none' }}
      />
      <Button type="button" onClick={() => {/* trigger file input */}}>
        📷
      </Button>
    </label>
  );
};
```

### 5. 画像最適化（オプション）

#### クライアントサイドでのリサイズ

- **ライブラリ**: `browser-image-compression` などを使用
- **最大サイズ**: 設定可能（デフォルト: 1920px幅）
- **品質**: 設定可能（デフォルト: 0.8）
- **フォーマット**: WebPへの変換（オプション）

### 6. 設定の保存と読み込み

**ファイル**: `src/lib/storageSettings.ts`（AI設定と同様のパターン）

```typescript
import { encrypt, decrypt } from "./encryption";

const STORAGE_KEY = "zedi-storage-settings";

export async function saveStorageSettings(
  settings: StorageSettings
): Promise<void> {
  // ユーザー自身のストレージアカウントの認証情報を暗号化して保存
  // 認証情報はZediのサーバーに送信されず、完全にローカルに保存される
  const encrypted = await encryptSensitiveData(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
}

export async function loadStorageSettings(): Promise<StorageSettings | null> {
  // 暗号化されたユーザーのストレージ設定を復号化して返す
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  const parsed = JSON.parse(stored);
  return await decryptSensitiveData(parsed);
}
```

---

## UI/UX詳細設計

### 1. 画像挿入ダイアログ（オプション）

複数の画像を一度にアップロードする場合のダイアログ：

```
┌─────────────────────────────────────────────────────────────┐
│  画像をアップロード                                    [×]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ [画像1]  │ │ [画像2]  │ │ [画像3]  │                     │
│  │          │ │          │ │          │                     │
│  │ ⏳ 75%   │ │ ✅ 完了  │ │ ⏳ 50%   │                     │
│  └──────────┘ └──────────┘ └──────────┘                     │
│                                                             │
│  [キャンセル]  [すべてアップロード]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 画像選択メニュー

画像をクリックした際に表示されるメニュー：

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────────┐                                           │
│  │              │                                           │
│  │  [画像プレビュー]                                         │
│  │              │                                           │
│  └──────────────┘                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📐 サイズ: [小] [中] [大] [フル幅]                    │   │
│  │ 📝 代替テキスト: [画像の説明を入力...]                 │   │
│  │ 🗑️ 削除                                               │   │
│  │ 🔗 URLをコピー                                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3. ストレージ未設定時の表示

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ 画像ストレージが設定されていません                       │
│                                                             │
│  画像をアップロードするには、あなた自身のストレージアカウント│
│  の設定が必要です。                                          │
│                                                             │
│  💡 サポートしているストレージ:                              │
│     • Google Drive（15GB無料）                              │
│     • Imgur（無料、最も簡単）                                │
│     • Cloudflare R2（10GB/月無料）                          │
│     • GitHub（無料）                                        │
│                                                             │
│  [設定画面を開く]  [キャンセル]                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 既存機能との統合

### 1. サムネイル抽出機能

- **既存機能**: `extractFirstImage()` 関数が既に実装済み
- **統合**: 画像ノードが追加されると、自動的にサムネイルとして使用される
- **更新**: ページ保存時に `thumbnail_url` を自動更新

### 2. マークダウンエクスポート

- **既存機能**: `markdownExport.ts` で画像ノードの変換が実装済み
- **確認**: 画像ノードが正しく `![alt](src)` 形式に変換されることを確認

### 3. Web Clipperとの統合

- **既存機能**: Web Clipperで取得した画像も外部ストレージにアップロード
- **統合**: Web Clipperの画像処理フローに外部ストレージアップロードを追加

---

## 実装ステップ

### Phase 1: 基盤実装

1. **Tiptap Image拡張の追加**
   - `@tiptap/extension-image` のインストール
   - エディタ設定への追加
   - `SUPPORTED_NODE_TYPES` への追加

2. **ストレージ設定の型定義**
   - `src/types/storage.ts` の作成
   - ストレージ設定の保存/読み込み機能

3. **ストレージプロバイダーインターフェース**
   - `src/lib/storage/types.ts` の作成
   - 基本インターフェースの定義

### Phase 2: ストレージ統合（優先順位順）

4. **Imgur プロバイダーの実装**（最優先：最も簡単）
   - Client IDのみで動作
   - 接続テスト機能
   - 実装コストが最も低い

5. **Cloudflare R2 プロバイダーの実装**（次優先：無料枠あり）
   - S3互換APIで実装が簡単
   - 接続テスト機能

6. **GitHub プロバイダーの実装**（開発者向け）
   - Personal Access Tokenのみ
   - 接続テスト機能

7. **Google Drive プロバイダーの実装**（OAuth2認証が必要）
   - OAuth2認証フローの実装
   - トークン管理
   - 接続テスト機能

8. **設定UIの実装**
   - 設定画面にストレージ設定セクションを追加
   - 各プロバイダー用の設定フォーム
   - 接続テスト機能
   - セットアップガイドへのリンク

### Phase 3: 画像挿入機能

6. **画像アップロードフック**
   - `useImageUpload` フックの実装

7. **ドラッグ&ドロップ対応**
   - エディタへのドラッグ&ドロップハンドラー

8. **クリップボードからのペースト**
   - ペーストハンドラーの実装

9. **ツールバーボタン**
   - 画像挿入ボタンの追加

### Phase 4: UX向上

10. **画像編集機能**
    - 画像選択メニューの実装
    - サイズ変更機能
    - 代替テキスト編集

11. **アップロード中の表示**
    - プログレスインジケーター
    - エラーハンドリング

12. **画像最適化（オプション）**
    - クライアントサイドでのリサイズ
    - フォーマット変換

### Phase 5: 将来の拡張（オプション）

13. **追加ストレージプロバイダー（必要に応じて）**
    - Dropbox（OAuth2認証が必要）
    - OneDrive（OAuth2認証が必要）
    - AWS S3
    - その他のS3互換ストレージ
    - カスタムURL（画像URLを直接使用）

---

## テスト要件

### 1. ユニットテスト

- ストレージプロバイダーの各メソッド
- 画像アップロードフック
- 設定の保存/読み込み

### 2. 統合テスト

- エディタへの画像挿入
- ドラッグ&ドロップ
- クリップボードからのペースト
- ストレージへのアップロード

### 3. E2Eテスト

- 画像挿入の完全なフロー
- ストレージ設定から画像挿入まで
- エラーハンドリング

---

## セキュリティ考慮事項

### 1. 認証情報の保護

- **暗号化**: ユーザー自身のストレージアカウントの認証情報は暗号化してローカルに保存
- **サーバー送信なし**: 認証情報はZediのサーバーに送信されない（完全にクライアントサイドで処理）
- **メモリ管理**: 認証情報は使用後すぐにクリア
- **プライバシー**: ユーザーのストレージ認証情報は完全にユーザーのデバイス内にのみ保存
- **OAuth2トークン**: Google Drive、Dropbox、OneDriveのAccess TokenとRefresh Tokenも暗号化して保存

### 1.1 OAuth2認証のセキュリティ

- **リダイレクトURI**: OAuth2認証のリダイレクトURIはアプリのオリジンに設定
- **スコープ**: 最小限の権限（ファイルの読み書きのみ）を要求
- **トークンの有効期限**: Access Tokenの有効期限を監視し、期限切れ前に自動更新
- **認証の取り消し**: ユーザーが認証を取り消した場合の適切な処理

### 2. 画像検証

- **ファイルタイプ**: 画像ファイルのみを受け付ける
- **ファイルサイズ**: 最大サイズの制限（設定可能）
- **マルウェアスキャン**: 可能な場合はスキャン（オプション）

### 3. CORS設定

- **ユーザーのストレージ**: ユーザー自身のストレージアカウントのCORS設定が正しく行われていることを確認
- **エラーハンドリング**: CORSエラー時の適切な処理とユーザーへの案内
- **設定ガイド**: 各ストレージサービスのCORS設定方法をドキュメント化

---

## パフォーマンス考慮事項

### 1. 画像の最適化

- **リサイズ**: 大きな画像は自動的にリサイズ
- **フォーマット**: WebPなどの効率的なフォーマットを使用（オプション）
- **遅延読み込み**: 画像は必要に応じて読み込む

### 2. アップロードの最適化

- **並列アップロード**: 複数画像は並列でアップロード
- **リトライ**: 失敗時の自動リトライ
- **キャンセル**: アップロードのキャンセル機能

### 3. キャッシュ

- **画像キャッシュ**: ブラウザのキャッシュを活用
- **設定キャッシュ**: ストレージ設定のキャッシュ

---

## 今後の拡張

### 1. 画像ギャラリー

- アップロード済み画像の一覧表示
- 画像の再利用

### 2. 画像編集機能

- クライアントサイドでの画像編集（回転、トリミング等）
- フィルター適用

### 3. 画像検索

- 画像のタグ付け
- 画像検索機能

### 4. バッチ処理

- 複数画像の一括アップロード
- 一括削除

---

## 参考資料

### Tiptap
- [Tiptap Image Extension](https://tiptap.dev/api/nodes/image)

### MVP版で実装するストレージ

#### Google Drive
- [Google Drive API](https://developers.google.com/drive/api)
- [Google Drive OAuth2認証](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/) - Client ID/Secretの取得

#### Imgur
- [Imgur API Documentation](https://apidocs.imgur.com/)
- [Imgur App登録](https://api.imgur.com/oauth2/addclient) - Client IDの取得（無料）

#### Cloudflare R2
- [Cloudflare R2 API](https://developers.cloudflare.com/r2/)
- [Cloudflare R2 無料枠](https://developers.cloudflare.com/r2/pricing/) - 10GB/月無料
- [Cloudflare Dashboard](https://dash.cloudflare.com/) - バケット作成とAccess Key取得

#### GitHub
- [GitHub API](https://docs.github.com/en/rest)
- [Personal Access Token作成](https://github.com/settings/tokens) - Tokenの取得
- [GitHub REST API - Contents](https://docs.github.com/en/rest/repos/contents) - ファイルアップロード用

---

## セットアップガイド

### Google Drive設定方法 {#google-drive-setup-guide}

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（または既存のプロジェクトを選択）
3. 「APIとサービス」>「ライブラリ」から「Google Drive API」を有効化
4. 「認証情報」>「認証情報を作成」>「OAuth 2.0 クライアント ID」
5. アプリケーションの種類を「ウェブアプリケーション」に設定
6. 承認済みのリダイレクト URIに `http://localhost:5173/oauth/google-drive` を追加（開発環境）
7. Client IDとClient SecretをコピーしてZediの設定画面に入力
8. 「認証」ボタンをクリックしてOAuth2認証を完了

### Imgur設定方法 {#imgur-setup-guide}

1. [Imgur App登録ページ](https://api.imgur.com/oauth2/addclient)にアクセス
2. 「Application name」を入力（例: "Zedi"）
3. 「Authorization type」で「Anonymous usage without user authorization」を選択
4. 「Authorization callback URL」は空欄でOK
5. 「Email」を入力して「Submit」をクリック
6. 表示された「Client ID」をコピーしてZediの設定画面に入力
7. 完了（Client Secretは不要）

### Cloudflare R2設定方法 {#cloudflare-r2-setup-guide}

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
2. 「R2」を選択
3. 「Create bucket」をクリックしてバケットを作成
4. バケット名を入力（例: "zedi-images"）
5. バケットを作成後、「Manage R2 API Tokens」をクリック
6. 「Create API token」をクリック
7. 権限を「Object Read & Write」に設定
8. Access Key IDとSecret Access KeyをコピーしてZediの設定画面に入力
9. バケット名も入力
10. 完了（無料枠: 10GB/月）

### GitHub設定方法 {#github-setup-guide}

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)にアクセス
2. 「Generate new token (classic)」をクリック
3. 「Note」に用途を入力（例: "Zedi Image Storage"）
4. 「Expiration」を設定（推奨: 90日または無期限）
5. 「repo」スコープにチェックを入れる
6. 「Generate token」をクリック
7. 表示されたトークンをコピー（再表示されないので注意）
8. Zediの設定画面に以下を入力：
   - リポジトリ: `username/repo-name`形式（例: `myusername/zedi-images`）
   - Personal Access Token: コピーしたトークン
   - ブランチ: `main`（デフォルト）
9. 完了（リポジトリは事前に作成しておく）
