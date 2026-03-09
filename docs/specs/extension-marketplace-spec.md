# 拡張機能マーケットプレイスシステム仕様書

> **ドキュメントバージョン:** 0.1
> **作成日:** 2026-03-08
> **ステータス:** 要件定義中（ドラフト）
> **関連 Issue:** #319

---

## 1. 概要

### 1.1 目的

Zedi に**拡張機能マーケットプレイス**を導入し、ユーザーがブラウザ上でプラグインを検索・インストール・管理できる仕組みを構築する。VSCode の Extension Marketplace や Obsidian の Community Plugins に類似した体験を提供する。

### 1.2 背景・動機

現在の Zedi はエディター拡張（Tiptap Extension）をコアバンドルとして提供しており、ユーザーが個別に機能を追加・削除する手段がない。以下の要件が発生したことで、プラグインシステムの必要性が明確になった：

- **日記自動作成機能**（毎日の日記ページを自動生成）
- **GitHub コントリビューション連携**（GitHub の活動データをエディターに表示）

これらはコアの知識管理機能とは独立しており、拡張機能として提供することが適切である。

### 1.3 設計原則

| 原則 | 説明 |
|------|------|
| **段階的導入** | 初期はファーストパーティ拡張のみ、将来的にサードパーティ対応 |
| **安全性優先** | サンドボックス実行、権限システム、レビュープロセス |
| **オフラインファースト** | インストール済み拡張はオフラインでも動作 |
| **パフォーマンス重視** | 遅延読み込み、未使用拡張のバンドル除外 |
| **既存アーキテクチャとの整合性** | Tiptap Extension / React Component 体系を活用 |

---

## 2. 拡張機能の種類

### 2.1 カテゴリ分類

| カテゴリ | 説明 | 例 |
|----------|------|-----|
| **エディター拡張** | Tiptap Extension としてエディターにノードやマークを追加 | GitHub コントリビューションブロック、カレンダーウィジェット |
| **自動化** | スケジュールやイベントに基づく自動処理 | 日記自動作成、定期バックアップ |
| **データ連携** | 外部サービスとのデータ同期・取得 | GitHub API 連携、Google Calendar 連携 |
| **テーマ** | UI のカスタマイズ | カラーテーマ、フォント変更 |
| **スラッシュコマンド** | `/` コマンドで呼び出せるアクション追加 | `/github`, `/diary`, `/weather` |

### 2.2 拡張機能のライフサイクル

```
発見 → インストール → 設定 → 有効化 → 使用 → 更新 → 無効化/アンインストール
```

---

## 3. アーキテクチャ設計

### 3.1 全体構成

```
┌─────────────────────────────────────────────────────┐
│                   Zedi Frontend                      │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Marketplace  │  │  Extension   │  │  Extension  │ │
│  │     UI       │  │   Manager    │  │   Runtime   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘ │
│         │                 │                  │        │
│  ┌──────┴─────────────────┴──────────────────┴─────┐ │
│  │            Extension Registry (Local)            │ │
│  └──────────────────────┬──────────────────────────┘ │
└─────────────────────────┼────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────┐
│              Zedi Server API                          │
│  ┌──────────────────────┴──────────────────────────┐ │
│  │         Extension Catalog API                    │ │
│  │  (GET /extensions, GET /extensions/:id, etc.)    │ │
│  └──────────────────────┬──────────────────────────┘ │
└─────────────────────────┼────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────┐
│        Extension Registry (Database)                  │
│  extensions, extension_versions, user_extensions      │
└──────────────────────────────────────────────────────┘
```

### 3.2 Extension Manifest（拡張機能定義）

各拡張機能は `manifest.json` を持つ：

```json
{
  "id": "zedi-daily-diary",
  "name": "Daily Diary",
  "displayName": "日記自動作成",
  "version": "1.0.0",
  "description": "毎日自動的にその日の日記ページを作成します",
  "author": "Zedi Team",
  "category": "automation",
  "icon": "calendar",
  "permissions": ["pages:create", "pages:read", "scheduler"],
  "entryPoint": "./index.ts",
  "tiptapExtensions": [],
  "slashCommands": ["/diary"],
  "settings": {
    "templateId": {
      "type": "string",
      "label": "日記テンプレート",
      "description": "日記ページのテンプレートID",
      "default": null
    },
    "autoCreateTime": {
      "type": "string",
      "label": "自動作成時刻",
      "description": "日記を自動作成する時刻（HH:mm形式）",
      "default": "00:00"
    }
  },
  "minimumZediVersion": "0.4.0"
}
```

### 3.3 Extension API（拡張機能が利用できる API）

```typescript
interface ZediExtensionAPI {
  // ページ操作
  pages: {
    create(title: string, content?: TiptapContent): Promise<Page>;
    get(id: string): Promise<Page | null>;
    getByTitle(title: string): Promise<Page | null>;
    update(id: string, content: TiptapContent): Promise<Page>;
    list(filter?: PageFilter): Promise<Page[]>;
  };

  // ノート操作
  notes: {
    create(pageId: string, content: TiptapContent): Promise<Note>;
    get(id: string): Promise<Note | null>;
    list(pageId: string): Promise<Note[]>;
  };

  // エディター操作
  editor: {
    registerNode(config: TiptapNodeConfig): void;
    registerMark(config: TiptapMarkConfig): void;
    registerSlashCommand(command: SlashCommandConfig): void;
    insertContent(content: TiptapContent): void;
  };

  // UI 操作
  ui: {
    showNotification(message: string, type: 'info' | 'success' | 'warning' | 'error'): void;
    showModal(config: ModalConfig): Promise<unknown>;
    registerSidebarPanel(config: SidebarPanelConfig): void;
    registerSettingsSection(config: SettingsSectionConfig): void;
  };

  // スケジューラー
  scheduler: {
    registerDaily(handler: () => Promise<void>, time?: string): void;
    registerInterval(handler: () => Promise<void>, intervalMs: number): void;
    unregister(handlerId: string): void;
  };

  // 外部 API
  http: {
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, body: unknown, options?: RequestOptions): Promise<Response>;
  };

  // ストレージ（拡張機能ローカル）
  storage: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };

  // コンテキスト
  context: {
    userId: string;
    locale: string;
    theme: 'light' | 'dark';
  };
}
```

### 3.4 権限システム

| 権限 | 説明 | リスクレベル |
|------|------|-------------|
| `pages:read` | ページの読み取り | 低 |
| `pages:create` | ページの作成 | 低 |
| `pages:update` | ページの更新 | 中 |
| `pages:delete` | ページの削除 | 高 |
| `notes:read` | ノートの読み取り | 低 |
| `notes:create` | ノートの作成 | 低 |
| `notes:update` | ノートの更新 | 中 |
| `scheduler` | スケジュール実行 | 中 |
| `http` | 外部 HTTP 通信 | 高 |
| `storage` | ローカルストレージ | 低 |

---

## 4. UI 設計

### 4.1 マーケットプレイス画面

```
┌──────────────────────────────────────────────────┐
│  ⚙ 設定  >  🧩 拡張機能                           │
├──────────────────────────────────────────────────┤
│                                                    │
│  🔍 拡張機能を検索...                               │
│                                                    │
│  [インストール済み] [おすすめ] [すべて]               │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ 📅 日記自動作成              v1.0.0        │   │
│  │ 毎日自動的にその日の日記ページを作成します   │   │
│  │ Zedi Team  |  ⭐ 4.8  |  ⬇ 1.2k          │   │
│  │                         [インストール済み ✓] │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ 🐙 GitHub コントリビューション   v1.0.0     │   │
│  │ GitHub の活動データをエディターに表示         │   │
│  │ Zedi Team  |  ⭐ 4.5  |  ⬇ 890            │   │
│  │                            [インストール]    │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
└──────────────────────────────────────────────────┘
```

### 4.2 拡張機能詳細画面

```
┌──────────────────────────────────────────────────┐
│  ← 戻る  |  📅 日記自動作成                       │
├──────────────────────────────────────────────────┤
│                                                    │
│  📅 日記自動作成                                    │
│  v1.0.0 | Zedi Team | 更新日: 2026-03-01          │
│                                                    │
│  [インストール済み ✓]  [⚙ 設定]  [🗑 アンインストール] │
│                                                    │
│  ── 説明 ──                                        │
│  毎日自動的にその日の日記ページを作成します。         │
│  テンプレートを設定して、日記のフォーマットを         │
│  カスタマイズできます。                              │
│                                                    │
│  ── 権限 ──                                        │
│  ✅ ページの作成 (pages:create)                     │
│  ✅ ページの読み取り (pages:read)                    │
│  ✅ スケジューラー (scheduler)                       │
│                                                    │
│  ── 設定 ──                                        │
│  日記テンプレート: [デフォルト ▼]                     │
│  自動作成時刻: [00:00]                              │
│                                                    │
└──────────────────────────────────────────────────┘
```

### 4.3 ナビゲーション

拡張機能マーケットプレイスへのアクセス経路：

1. **設定画面** → 「拡張機能」タブ
2. **サイドバー** → 拡張機能アイコン（将来的に）
3. **コマンドパレット** → 「拡張機能を管理」

---

## 5. データベーススキーマ

### 5.1 新規テーブル

```sql
-- 拡張機能カタログ
CREATE TABLE extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  icon TEXT,
  author TEXT NOT NULL,
  repository_url TEXT,
  is_official BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 拡張機能バージョン
CREATE TABLE extension_versions (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL REFERENCES extensions(id),
  version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  bundle_url TEXT NOT NULL,
  changelog TEXT,
  minimum_zedi_version TEXT,
  is_latest BOOLEAN DEFAULT false,
  published_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(extension_id, version)
);

-- ユーザーの拡張機能インストール状態
CREATE TABLE user_extensions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  extension_id TEXT NOT NULL REFERENCES extensions(id),
  version TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  installed_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, extension_id)
);
```

---

## 6. API エンドポイント

### 6.1 Extension Catalog API

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/extensions` | 拡張機能一覧取得（検索・フィルター対応） |
| `GET` | `/api/extensions/:id` | 拡張機能詳細取得 |
| `GET` | `/api/extensions/:id/versions` | バージョン一覧取得 |
| `POST` | `/api/user/extensions/:id/install` | 拡張機能インストール |
| `DELETE` | `/api/user/extensions/:id` | 拡張機能アンインストール |
| `PATCH` | `/api/user/extensions/:id` | 拡張機能設定更新（有効/無効、設定値） |
| `GET` | `/api/user/extensions` | ユーザーのインストール済み拡張機能一覧 |

---

## 7. 実装フェーズ

### Phase 1: 拡張機能基盤（MVP）

- Extension Manager（フロントエンド）
- Extension Runtime（ローカル実行環境）
- ファーストパーティ拡張のハードコード登録
- 設定画面への「拡張機能」タブ追加
- インストール/アンインストール UI

### Phase 2: サーバーサイド拡張カタログ

- データベーススキーマ追加
- Extension Catalog API
- マーケットプレイス UI（検索・フィルター）
- 拡張機能のバージョン管理

### Phase 3: サードパーティ対応

- Extension SDK（開発者向け）
- サンドボックス実行環境
- レビュー・承認プロセス
- 拡張機能の公開フロー

---

## 8. 要件定義のための質問・提案

### 8.1 質問事項

#### アーキテクチャに関する質問

| # | 質問 | 選択肢 / 補足 |
|---|------|--------------|
| Q1 | 拡張機能の実行環境はどこか？ | **A)** フロントエンドのみ（ブラウザ内）<br>**B)** サーバーサイドも含む（スケジューラー等）<br>**C)** ハイブリッド（種類による） |
| Q2 | オフラインモードでの拡張機能の動作要件は？ | ローカルストレージモードとの整合性 |
| Q3 | 拡張機能のバンドル方式は？ | **A)** ビルド時にバンドル（静的）<br>**B)** 実行時にダイナミックインポート（動的）<br>**C)** Web Worker でサンドボックス実行 |
| Q4 | マルチデバイス同期は必要か？ | 拡張機能のインストール状態・設定をデバイス間で同期するか |

#### ビジネス要件に関する質問

| # | 質問 | 選択肢 / 補足 |
|---|------|--------------|
| Q5 | 有料拡張機能の予定はあるか？ | 課金モデル：月額サブスクリプション / 買い切り / フリーミアム |
| Q6 | サードパーティ開発者の受け入れ時期は？ | MVP ではファーストパーティのみで十分か |
| Q7 | 拡張機能のレビュープロセスは？ | 自動レビュー / 手動レビュー / 信頼スコア |

#### UX に関する質問

| # | 質問 | 選択肢 / 補足 |
|---|------|--------------|
| Q8 | マーケットプレイスへのアクセス導線は？ | 設定画面内 / サイドバー / 専用ページ |
| Q9 | 拡張機能の更新通知は必要か？ | 自動更新 / 手動更新 / 通知のみ |
| Q10 | 拡張機能が追加する UI 要素の表示位置は？ | サイドバー / エディター内 / ツールバー / フローティング |

### 8.2 提案事項

#### 提案 1: 段階的リリース戦略

**Phase 1 では「ハードコード登録 + インストール UI」のみとする。**

理由：
- 動的なプラグインローダーの実装は複雑で、セキュリティリスクも伴う
- 初期の拡張機能（日記・GitHub）はファーストパーティであり、リポジトリ内に含められる
- ユーザーには「インストール/アンインストール」の UI 体験だけ提供し、裏側はフィーチャーフラグで制御
- 将来的にダイナミックインポートに移行しても、UI 体験は変わらない

#### 提案 2: Tiptap Extension をベースとした拡張 API

**エディター拡張は既存の Tiptap Extension 機構をそのまま活用する。**

理由：
- Tiptap には Extension / Node / Mark の仕組みが既にある
- `slashSuggestionPlugin.ts` で `/` コマンドの基盤が既に存在する
- 新たな抽象レイヤーを作るよりも、Tiptap のエコシステムに乗る方が安定
- Node View（React コンポーネント）で任意の UI を描画できる

#### 提案 3: 拡張機能の設定は既存の Settings 画面に統合

**専用の設定 UI を作るのではなく、Settings ページ内に「拡張機能」セクションを追加する。**

理由：
- 既存の `src/pages/Settings.tsx` に統合することで一貫した UX を維持
- 各拡張機能の設定は `settings` フィールドから動的に生成
- ユーザーは設定画面 1 つですべてを管理できる

#### 提案 4: スケジューラーはサーバーサイドで実装

**日記自動作成のようなスケジュール機能はサーバー側（cron ジョブ）で実装する。**

理由：
- ブラウザが開いていないときも動作する必要がある
- Service Worker でのスケジュール実行はブラウザ制約が多い
- サーバー側で `node-cron` や Railway の Cron Jobs を活用できる
- ユーザーのタイムゾーンを考慮した実装が容易

---

## 9. セキュリティ考慮事項

| リスク | 対策 |
|--------|------|
| 悪意のある拡張機能 | 権限システム + レビュープロセス |
| XSS | Tiptap のサニタイズ機構 + CSP ヘッダー |
| データ漏洩 | 拡張機能の HTTP 通信を許可リストで制限 |
| パフォーマンス低下 | 拡張機能の実行時間制限 + メモリ使用量制限 |
| 依存関係の脆弱性 | 拡張機能のバンドルは CI で脆弱性スキャン |

---

## 10. 関連ドキュメント

- [エディター拡張実装計画](../plans/20260215/editor-extensions-implementation-plan.md)
- [日記自動作成拡張仕様書](./daily-diary-extension-spec.md)
- [GitHub コントリビューションコンポーネント仕様書](./github-contribution-component-spec.md)
- [Zedi データ構造仕様書](./zedi-data-structure-spec.md)
