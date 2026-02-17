# Zedi 機能利用可否マトリクス — ユーザー状態別

> **目的**: ログイン有無・ネットワーク接続有無など、ユーザーの状態ごとにどの機能が利用できるかを整理し、  
> 未ログインユーザーへの機能開放やオフライン対応の検討材料とする。

---

## 1. ユーザー状態の定義

| 状態 | 略称 | 説明 |
|------|------|------|
| **ログイン済み + オンライン** | `Auth+Online` | Cognito トークンが有効で、ネットワーク接続あり。全機能が利用可能。 |
| **ログイン済み + オフライン** | `Auth+Offline` | トークンは localStorage に保存されているが、API/WebSocket に到達不可。 |
| **未ログイン + オンライン** | `Guest+Online` | 認証トークンなし。ネットワーク接続あり。 |
| **未ログイン + オフライン** | `Guest+Offline` | 認証トークンなし。ネットワーク接続なし。最も制約が強い状態。 |

---

## 2. 現在のルーティングと認証ガード

### 2.1 ルート保護の仕組み

`ProtectedRoute` コンポーネント (`src/components/auth/ProtectedRoute.tsx`) が認証ガードを担当する。  
未認証ユーザーがアクセスすると `/sign-in` へリダイレクトされる。

```
App.tsx
├── Public Routes（認証不要）
│   ├── /                      Landing（ログイン済みなら /home へリダイレクト）
│   ├── /sign-in/*             サインイン画面
│   ├── /auth/callback         OAuth コールバック
│   ├── /note/:noteId          ノート閲覧（公開ノート）
│   ├── /note/:noteId/settings ノート設定
│   ├── /note/:noteId/members  ノートメンバー管理
│   └── /note/:noteId/page/:pageId  ノート内ページ閲覧
│
├── Protected Routes（ProtectedRoute でラップ → 未認証は /sign-in へ）
│   ├── /onboarding            初回セットアップウィザード
│   ├── /home                  ホーム（ページ一覧グリッド）
│   ├── /notes                 ノート一覧
│   ├── /page/:id              ページエディタ
│   ├── /settings              設定ハブ
│   ├── /settings/ai           AI 設定
│   ├── /settings/storage      ストレージ設定
│   ├── /settings/general      一般設定（プロフィール等）
│   ├── /pricing               料金プラン
│   └── /donate                寄付ページ
│
└── Catch-all
    └── *                      404 Not Found
```

### 2.2 認証フロー

1. AWS Cognito OAuth (Google / GitHub) でソーシャルログイン
2. トークンは `localStorage` (`zedi_cognito_auth`) に保存
3. `CognitoAuthProvider` が `isSignedIn` / `userId` / `getToken()` を Context で提供
4. `useAuth()` hook 経由で全コンポーネントから参照
5. API クライアント (`apiClient.ts`) は全リクエストに `Authorization: Bearer <token>` を付与  
   → トークンがなければ `ApiError(401)` をスロー

### 2.3 現在の問題点

- **ホームページ (`/home`) にアクセスするにはログインが必須**
- 未ログインユーザーは Landing ページ (`/`) とサインイン画面しか利用できない
- ノート閲覧 (`/note/:noteId`) は Public Route だが、**API呼び出しに認証が必要** なため、実質的にログインが必要
- IndexedDB は `userId` をキーにしてデータベースを開くため、未ログイン時のデータ保存先がない

---

## 3. 機能利用可否マトリクス

### 凡例

| 記号 | 意味 |
|------|------|
| ✅ | 完全に利用可能 |
| ⚠️ | 部分的に利用可能（制限あり） |
| ❌ | 利用不可 |
| 🔧 | 現在は不可だが、実装変更で対応可能 |

---

### 3.1 ページ管理

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **ページ一覧表示** (`/home`) | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | IndexedDB から読み取り。ProtectedRoute がブロック。 |
| **ページ作成** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | IndexedDB にローカル保存。userId が必要。 |
| **ページ編集** (TipTap エディタ) | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | Y.Doc は IndexedDB に永続化。エディタ自体はオフラインで動作可能。 |
| **ページ削除** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | 論理削除を IndexedDB に記録。 |
| **ページ検索**（ローカル） | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | IndexedDB の `search_index` を全文検索。 |
| **グローバル検索** (Cmd+K) | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | ローカル検索は動作。共有ノート検索は API 必須。 |

**技術的背景**:
- ページの CRUD は全て `IndexedDBStorageAdapter` を通じてローカルで完結する
- `useRepository()` hook は未認証時に `LOCAL_USER_ID = "local-user"` をフォールバック値として持っている（ただし ProtectedRoute でブロックされるため到達しない）
- `StorageAdapterPageRepository` はネットワーク非依存でローカル操作可能

---

### 3.2 クラウド同期

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **初回同期** (Aurora → IndexedDB) | ✅ | ❌ | ❌ | ❌ | API `GET /api/sync/pages` で全データ取得。 |
| **差分同期** (双方向) | ✅ | ❌ | ❌ | ❌ | Pull + Push。LWW (Last Write Wins) で競合解決。 |
| **手動同期** (SyncIndicator) | ✅ | ❌ | ❌ | ❌ | `resetSyncFailures()` + `force: true` で再試行。 |
| **Y.Doc 同期** (Aurora API) | ✅ | ❌ | ❌ | ❌ | `GET/PUT /api/pages/:id/content` で base64 エンコードされた Y.Doc を送受信。 |

**技術的背景**:
- `syncWithApi()` は `StorageAdapter` (IndexedDB) と `ApiClient` の双方を使用
- 同期はページメタデータのみ。Y.Doc の内容はページを開いたときにオンデマンドで同期
- 連続3回失敗すると自動リトライ停止 (`MAX_CONSECUTIVE_FAILURES = 3`)
- オフライン時はローカルの変更が IndexedDB に蓄積され、次回オンライン時に Push される

---

### 3.3 ノート（共有機能）

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **ノート一覧** (`/notes`) | ✅ | ❌ | ❌ | ❌ | `GET /api/notes` で取得。ProtectedRoute かつ API 必須。 |
| **ノート作成** | ✅ | ❌ | ❌ | ❌ | `POST /api/notes`。サーバーサイドで作成。 |
| **ノート閲覧** (`/note/:noteId`) | ✅ | ❌ | ⚠️ | ❌ | Public Route だが、`useNote()` hook は `isSignedIn` が `true` の場合のみ API を呼ぶ。 |
| **ノートページ閲覧** (`/note/:noteId/page/:pageId`) | ✅ | ❌ | ⚠️ | ❌ | 同上。ページ内容は API から取得。 |
| **ノート設定変更** | ✅ | ❌ | ❌ | ❌ | `PUT /api/notes/:id`。owner のみ。 |
| **メンバー管理** | ✅ | ❌ | ❌ | ❌ | `POST/PUT/DELETE /api/notes/:id/members`。owner のみ。 |
| **ノートへのページ追加** | ✅ | ❌ | ❌ | ❌ | `POST /api/notes/:id/pages`。 |
| **リアルタイム共同編集** | ✅ | ❌ | ❌ | ❌ | Hocuspocus WebSocket。認証トークンが必要。 |

**技術的背景**:
- ノート関連の全操作は REST API 経由 (`useNoteQueries.ts`)
- ノートデータのローカルキャッシュは TanStack Query のインメモリキャッシュのみ（IndexedDB に永続化されない）
- `useNote()` / `useNotePages()` は `enabled: isLoaded && isSignedIn` で制御
- 公開ノートの閲覧ルートは存在するが、API が認証を要求するため実質的に機能しない

---

### 3.4 エディタ機能

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **リッチテキスト編集** (TipTap) | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | エディタ自体はネットワーク非依存。 |
| **WikiLink** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | ローカル IndexedDB でリンク先の存在チェック。 |
| **テーブル、コードブロック、数式** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | TipTap Extension。全てクライアントサイド。 |
| **Mermaid ダイアグラム** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | クライアントサイドレンダリング。 |
| **タスクリスト** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | クライアントサイド。 |
| **画像挿入**（S3アップロード） | ✅ | ❌ | ❌ | ❌ | `POST /api/media/upload` で presigned URL 取得。 |
| **画像挿入**（ローカル保存） | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | IndexedDB に保存（ストレージ設定による）。 |

**技術的背景**:
- TipTap エディタとその Extension はすべてクライアントサイドで動作
- Y.Doc（Yjs）は IndexedDB に `zedi-doc-{pageId}` として永続化
- `CollaborationManager` の `local` モードはオフラインで動作し、Aurora API が利用可能になったら差分をマージ

---

### 3.5 AI 機能

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **AI チャット** | ✅ | ❌ | ❌ | ❌ | WebSocket/HTTP API 経由。サブスクリプション制限あり。 |
| **Wiki 生成** | ✅ | ❌ | ❌ | ❌ | AI API 経由。 |
| **Mermaid ダイアグラム生成** | ✅ | ❌ | ❌ | ❌ | AI API 経由。 |
| **AI 設定**（プロバイダ・モデル選択） | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | 設定は IndexedDB/localStorage に保存。モデル一覧の取得は API 必要。 |

**技術的背景**:
- AI 機能は全て外部 API (OpenAI / Anthropic / Google) またはサーバー経由
- AI 設定は `localStorage` (`zedi-ai-settings`) に保存されるためオフラインでも参照可能
- サーバーモデル一覧は `localStorage` にキャッシュ (`zedi-ai-server-models`, TTL: 10分)

---

### 3.6 設定・ユーザー管理

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **一般設定**（プロフィール、言語） | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | ローカル保存はオフライン可。サーバーへの同期は要オンライン。 |
| **ストレージ設定** | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | `localStorage` (`zedi-storage-settings`) に保存。 |
| **AI 設定** | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | 同上。 |
| **オンボーディング** | ✅ | ⚠️ | ❌ 🔧 | ❌ 🔧 | `localStorage` (`zedi-onboarding`) で状態管理。 |
| **サインイン / サインアウト** | ✅ | ❌ | ✅ | ❌ | Cognito OAuth フロー。ネットワーク必須。 |
| **サブスクリプション管理** | ✅ | ❌ | ❌ | ❌ | Stripe API 経由。 |

---

### 3.7 その他

| 機能 | Auth+Online | Auth+Offline | Guest+Online | Guest+Offline | 備考 |
|------|:-----------:|:------------:|:------------:|:-------------:|------|
| **Landing ページ表示** | ✅ (→ /home へリダイレクト) | ✅ (→ /home へリダイレクト) | ✅ | ⚠️ | 静的コンテンツ。アセットのキャッシュ次第。 |
| **テーマ切替**（ダーク/ライト） | ✅ | ✅ | ✅ | ✅ | `next-themes`。完全にクライアントサイド。 |
| **多言語切替**（日本語/英語） | ✅ | ✅ | ✅ | ✅ | `i18next`。翻訳ファイルはバンドルに含まれる。 |
| **Markdown エクスポート** | ✅ | ✅ | ❌ 🔧 | ❌ 🔧 | クライアントサイド変換。 |
| **Web クリッピング** | ✅ | ❌ | ❌ | ❌ | 外部 URL からの取得が必要。 |
| **PWA インストール** | ⚠️ | ❌ | ⚠️ | ❌ | `site.webmanifest` は存在するが Service Worker なし。 |

---

## 4. データストレージの現状

### 4.1 ローカルストレージ（ネットワーク非依存）

| ストレージ | データ | キー/名前 | 備考 |
|-----------|--------|-----------|------|
| **IndexedDB** | ページメタデータ | `zedi-storage-{userId}` → `my_pages` | `userId` 単位で DB 分離 |
| **IndexedDB** | Y.Doc（エディタ内容） | `zedi-doc-{pageId}` | `y-indexeddb` ライブラリ管理 |
| **IndexedDB** | リンク/ゴーストリンク | `my_links`, `my_ghost_links` | WikiLink の関連データ |
| **IndexedDB** | 検索インデックス | `search_index` | ページ全文テキスト |
| **IndexedDB** | 同期メタデータ | `meta` → `lastSyncTime` | 差分同期の基準時刻 |
| **localStorage** | 認証トークン | `zedi_cognito_auth` | Cognito JWT トークン + 有効期限 |
| **localStorage** | プロフィールキャッシュ | `zedi-profile-cache` | 表示名・アバター等 |
| **localStorage** | 設定（一般/AI/ストレージ） | `zedi-general-settings` 等 | 各種ユーザー設定 |
| **localStorage** | オンボーディング状態 | `zedi-onboarding` | 完了フラグ |
| **localStorage** | 言語設定 | `zedi-i18next-lng` | `en` / `ja` |
| **localStorage** | AI モデルキャッシュ | `zedi-ai-server-models` | TTL: 10分 |

### 4.2 サーバーストレージ（ネットワーク必須）

| ストレージ | データ | 備考 |
|-----------|--------|------|
| **Aurora PostgreSQL** | ページメタデータ・Y.Doc | 同期の信頼性ソース (Source of Truth) |
| **Aurora PostgreSQL** | ノート・メンバー | ノート関連データは全てサーバー管理 |
| **Aurora PostgreSQL** | ユーザー情報 | Cognito sub / email |
| **S3** | 画像ファイル | Presigned URL でアップロード |
| **Hocuspocus + Redis** | リアルタイム編集セッション | WebSocket 接続中のみ |

---

## 5. 未ログイン/オフライン対応に向けた分析

### 5.1 技術的にすぐ対応可能な機能 (🔧)

以下の機能は、**ルーティングガードの解除** と **ゲストユーザー用 userId の割り当て** だけで基本的に動作する。

| 機能 | 必要な変更 |
|------|-----------|
| ページ一覧表示 | `ProtectedRoute` を解除し、`LOCAL_USER_ID` で IndexedDB を初期化 |
| ページ作成・編集・削除 | 同上。Y.Doc + IndexedDB はネットワーク非依存 |
| ローカル検索 | IndexedDB の `search_index` はそのまま利用可能 |
| リッチテキスト編集 | TipTap + Extensions は全てクライアントサイド |
| WikiLink | ローカルページ間のリンクは IndexedDB で完結 |
| 設定変更（ローカル） | localStorage に保存。サーバー同期は後回し |

### 5.2 対応に追加実装が必要な機能

| 機能 | 追加実装内容 |
|------|-------------|
| **ログイン後のデータ引き継ぎ** | ゲスト `local-user` の IndexedDB データを認証ユーザーの DB にマイグレーション |
| **オフラインアセットキャッシュ** | Service Worker (Workbox) で HTML/JS/CSS をキャッシュし、オフラインでもアプリが起動するようにする |
| **オフライン検知 & UI 表示** | `navigator.onLine` + `online`/`offline` イベントでステータス表示 |
| **公開ノート閲覧（未認証）** | API 側で認証不要の公開ノート取得エンドポイントを追加、またはフロントで未認証アクセスを許可 |
| **バックグラウンド同期** | Service Worker の Background Sync API でオフライン中の変更をキューイング |

### 5.3 現在のアーキテクチャの強み

1. **ローカルファーストアーキテクチャ**: ページ CRUD は既に IndexedDB 経由で動作しており、ネットワーク依存なし
2. **StorageAdapter パターン**: `StorageAdapter` インターフェースで抽象化されており、認証状態に関わらずローカル操作が可能
3. **Y.js + IndexedDB**: エディタの状態が自動的にローカルに永続化される
4. **LOCAL_USER_ID フォールバック**: `useRepository()` に既に `const LOCAL_USER_ID = "local-user"` が定義されており、未認証時のフォールバックが想定されている
5. **同期は非同期**: データの読み書きはローカル、同期は後からバッチで実行

### 5.4 対応に注意が必要な点

1. **IndexedDB のユーザー分離**: ゲストデータとログインユーザーデータの分離・統合ロジック
2. **Service Worker 導入**: Vite + React SPA に Service Worker を追加する場合の設定 (`vite-plugin-pwa` 等)
3. **API の認証ポリシー変更**: 公開リソースへのアクセスに認証不要なエンドポイントを追加する場合、Lambda/API Gateway の認可設定変更が必要
4. **データ競合**: ゲスト時のデータとサーバーデータの競合解決ポリシー

---

## 6. 推奨実装ステップ

### Phase 1: 未ログインでのローカルメモ機能

1. `/home` と `/page/:id` の `ProtectedRoute` を解除（または条件付きバイパス）
2. 未認証ユーザーは `LOCAL_USER_ID` で IndexedDB を初期化
3. ページ作成・編集・削除・検索をゲストモードで動作させる
4. ヘッダーにログイン促進 UI を表示（「ログインしてクラウド同期を有効にする」等）
5. 同期関連のフック (`useSync`) は `isSignedIn` が false の場合スキップ（既に実装済み）

### Phase 2: オフライン対応 (PWA)

1. `vite-plugin-pwa` + Workbox で Service Worker を導入
2. 静的アセット（HTML, JS, CSS, フォント）のプリキャッシュ
3. `navigator.onLine` + イベントリスナーでオフライン状態検知
4. UI にオフラインインジケーターを追加（SyncIndicator の拡張）
5. `site.webmanifest` の更新

### Phase 3: データ引き継ぎ & 公開ノート

1. ゲスト → ログインユーザーへの IndexedDB データマイグレーション
2. 公開ノート閲覧用の認証不要 API エンドポイント追加
3. Background Sync によるオフライン変更のキューイング

---

## 7. 参考: 関連ファイル一覧

| 領域 | ファイルパス |
|------|-------------|
| ルーティング | `src/App.tsx` |
| 認証ガード | `src/components/auth/ProtectedRoute.tsx` |
| 認証プロバイダー | `src/components/auth/CognitoAuthProvider.tsx` |
| 認証フック | `src/hooks/useAuth.ts` |
| API クライアント | `src/lib/api/apiClient.ts` |
| ストレージアダプター | `src/lib/storageAdapter/IndexedDBStorageAdapter.ts` |
| 同期エンジン | `src/lib/sync/syncWithApi.ts` |
| ページクエリフック | `src/hooks/usePageQueries.ts` |
| ノートクエリフック | `src/hooks/useNoteQueries.ts` |
| コラボレーション | `src/lib/collaboration/CollaborationManager.ts` |
| コラボレーションフック | `src/hooks/useCollaboration.ts` |
| Web マニフェスト | `public/site.webmanifest` |
