# テスト実装計画 (Test Implementation Plan)

| 項目       | 内容                                   |
| :--------- | :------------------------------------- |
| 作成日     | 2026-02-23                             |
| 対象       | Zedi - Zero-Friction Knowledge Network |
| 現在の状態 | Phase 1 完了（基盤テスト実装済み）     |
| テスト総数 | 226 テスト（36 ファイル）              |
| 合格率     | 215/226（95%、失敗 11 件は既存の問題） |

---

## 0. 現在のテストカバレッジ

### 0.1 実装済みテスト一覧

#### バックエンド（API Lambda）

| ファイル            | テスト数 | カバー範囲                                          |
| :------------------ | :------- | :-------------------------------------------------- |
| `app.test.ts`       | 既存     | ヘルスチェック、CORS、404、認証要求                 |
| `schema.test.ts`    | 既存     | Drizzle ORM スキーマ定義の整合性                    |
| `client.test.ts`    | 既存     | DB クライアント接続                                 |
| `pages.test.ts`     | 12       | CRUD、コンテンツ取得、楽観ロック、認可              |
| `syncPages.test.ts` | 8        | デルタ/フル同期、LWW、リンク同期                    |
| `notes.test.ts`     | 18       | CRUD、ページ管理、メンバー管理、権限                |
| `users.test.ts`     | 8        | ユーザー作成/更新、メールによるアカウント統合       |
| `search.test.ts`    | 5        | 空クエリ、pg_bigm 検索、own/shared スコープ         |
| `clip.test.ts`      | 5        | URL バリデーション、HTML フェッチ                   |
| `media.test.ts`     | 7        | プリサインド URL、アップロード確認、S3 リダイレクト |

#### フロントエンド

| ファイル                    | テスト数 | カバー範囲                              |
| :-------------------------- | :------- | :-------------------------------------- |
| `apiClient.test.ts`         | 10       | 認証、レスポンス処理、503 リトライ      |
| `syncWithApi.test.ts`       | 13       | プル/プッシュ、LWW 競合解決、エラー処理 |
| `aiService.test.ts`         | 既存     | AI サービスロジック                     |
| `aiSettings.test.ts`        | 既存     | AI 設定の永続化                         |
| `contentUtils.test.ts`      | 既存     | コンテンツユーティリティ                |
| `searchUtils.test.ts`       | 既存     | 検索スコアリング、ハイライト            |
| `useLinkedPages.test.ts`    | 既存     | リンクページ計算、2-hop リンク          |
| `useSyncWikiLinks.test.ts`  | 既存     | WikiLink 同期ロジック                   |
| `useProfile.test.ts`        | 既存     | プロフィール管理                        |
| `useGlobalSearch.test.ts`   | 既存     | グローバル検索フック                    |
| `useEditorAutoSave.test.ts` | 既存     | 自動保存ロジック                        |
| その他コンポーネントテスト  | 既存     | PageTitleBlock、LinkedPagesSection 等   |

#### E2E テスト（Playwright）

| ファイル               | カバー範囲                    |
| :--------------------- | :---------------------------- |
| `page-editor.spec.ts`  | ページエディタの操作フロー    |
| `search.spec.ts`       | 検索機能の E2E フロー         |
| `linked-pages.spec.ts` | リンクページ表示の E2E フロー |

### 0.2 未テスト領域の概観

```
未テスト領域（約 218 ファイル）
├── バックエンド
│   ├── ルート: checkout, webhooks, AI (chat/models/subscription/usage), thumbnail
│   ├── ミドルウェア: auth, errorHandler, rateLimiter, db
│   └── サービス: aiProviders, subscriptionService, usageService 等
├── フロントエンド
│   ├── 認証: cognitoAuth, useAuth, CognitoAuthProvider
│   ├── コラボレーション: CollaborationManager, useCollaboration
│   ├── ストレージ: IndexedDBStorageAdapter, S3/Gyazo/GitHub プロバイダー
│   ├── エディタ: TiptapEditor, 各拡張機能, WikiLink サジェスト
│   ├── AI チャット: AIChatPanel, AIChatContext, aiChatActions
│   └── ページ/ルート: Home, Settings, Notes, Pricing 等
└── E2E
    └── AI 機能、ノート機能、Web クリッピング、同期
```

---

## 1. テスト戦略の原則

### 1.1 テストピラミッド

```
        ╱╲
       ╱  ╲        E2E テスト（少数、重要フロー）
      ╱    ╲       → Playwright
     ╱──────╲
    ╱        ╲     統合テスト（中程度）
   ╱          ╲    → Vitest + Hono app.request
  ╱────────────╲
 ╱              ╲  ユニットテスト（多数、高速）
╱                ╲ → Vitest + vi.mock
```

### 1.2 テスト対象の優先順位付け

| 優先度 | 基準                                                       |
| :----- | :--------------------------------------------------------- |
| P0     | セキュリティ、決済、データ整合性に直結するコード           |
| P1     | ユーザーの主要操作フロー（CRUD、検索、同期）に関わるコード |
| P2     | ビジネスロジック（AI 機能、サブスクリプション）            |
| P3     | UI コンポーネント（インタラクション中心のもの）            |
| P4     | ユーティリティ、設定、プレゼンテーション用コンポーネント   |

### 1.3 モック戦略

| 依存先            | モック方法                                         |
| :---------------- | :------------------------------------------------- |
| データベース      | `createMockDb()` ヘルパー（Phase 1 で実装済み）    |
| AWS SDK           | `vi.mock` でクラスモック（Phase 1 で実装済み）     |
| 外部 API（AI 等） | `vi.mock` + `mockResolvedValue`                    |
| ブラウザ API      | `vi.stubGlobal` / `jsdom`                          |
| Hono ミドルウェア | `vi.mock` でコンテキスト注入（Phase 1 で実装済み） |
| タイマー          | `vi.useFakeTimers`（Phase 1 で実装済み）           |

---

## 2. Phase 2: バックエンド ミドルウェア & サービス

**目標:** API の信頼性を保証するミドルウェアと、コアサービスロジックのテスト

**推定工数:** 3-4 日

### 2.1 ミドルウェアテスト

| ファイル                     | 優先度 | テスト内容                                                                         |
| :--------------------------- | :----- | :--------------------------------------------------------------------------------- |
| `middleware/auth.ts`         | P0     | JWT 検証、トークン期限切れ、不正トークン拒否、cognitoSub/userId のコンテキスト設定 |
| `middleware/errorHandler.ts` | P0     | 各種エラーのレスポンス変換、DATABASE_RESUMING 検出、スタックトレース除去（本番）   |
| `middleware/rateLimiter.ts`  | P1     | DynamoDB レート制限、制限超過時の 429、TTL 管理                                    |
| `middleware/db.ts`           | P1     | DB 接続の初期化、コンテキストへの注入、接続エラー処理                              |

#### テスト方針

- `auth.ts`: Cognito JWT の検証をモック。有効/無効/期限切れトークンのケースを網羅
- `errorHandler.ts`: 各種 Error クラス（`HTTPException`, `ApiError`, カスタム Error）の変換を検証
- `rateLimiter.ts`: DynamoDB クライアントをモックし、カウンター増加と制限超過を検証
- `db.ts`: `drizzle()` をモックし、環境変数から正しく接続が作られることを検証

### 2.2 サービスレイヤーテスト

| ファイル                          | 優先度 | テスト内容                                                                                        |
| :-------------------------------- | :----- | :------------------------------------------------------------------------------------------------ |
| `services/aiProviders.ts`         | P1     | 各プロバイダー（OpenAI/Anthropic/Google）のリクエスト構築、ストリーミング処理、エラーハンドリング |
| `services/subscriptionService.ts` | P0     | プラン判定、利用量チェック、アクセス権限                                                          |
| `services/usageService.ts`        | P1     | 使用量記録、月次リセット、制限チェック                                                            |
| `services/commitService.ts`       | P2     | サムネイルコミット処理                                                                            |
| `services/imageSearch.ts`         | P2     | 画像検索クエリ構築とレスポンス解析                                                                |

---

## 3. Phase 3: バックエンド 未テストルート

**目標:** 決済、AI、サムネイル関連の全 API エンドポイントのテスト

**推定工数:** 3-4 日

### 3.1 決済関連（P0）

| ファイル                   | テスト内容                                                              |
| :------------------------- | :---------------------------------------------------------------------- |
| `routes/checkout.ts`       | チェックアウトセッション作成、カスタマーポータル URL 生成、認証チェック |
| `routes/webhooks/polar.ts` | Webhook 署名検証、イベント処理（支払い成功/失敗/キャンセル）、冪等性    |

#### テスト方針

- Polar SDK をモックし、チェックアウトフロー全体を検証
- Webhook のイベントペイロードを複数パターン用意し、正しいDB更新を検証
- 署名検証の成功/失敗ケースをテスト

### 3.2 AI 関連（P1）

| ファイル                    | テスト内容                                                           |
| :-------------------------- | :------------------------------------------------------------------- |
| `routes/ai/chat.ts`         | チャットリクエストの構築、ストリーミングレスポンス、コンテキスト注入 |
| `routes/ai/models.ts`       | 利用可能モデル一覧の取得、サブスクリプションに応じたフィルタリング   |
| `routes/ai/subscription.ts` | サブスクリプション状態の取得/更新                                    |
| `routes/ai/usage.ts`        | 使用量の記録/取得、月次制限チェック                                  |

### 3.3 サムネイル関連（P2）

| ファイル                            | テスト内容                            |
| :---------------------------------- | :------------------------------------ |
| `routes/thumbnail/commit.ts`        | サムネイルのコミット処理              |
| `routes/thumbnail/imageGenerate.ts` | AI 画像生成リクエスト、レスポンス処理 |
| `routes/thumbnail/imageSearch.ts`   | 画像検索クエリとレスポンスの変換      |

---

## 4. Phase 4: フロントエンド 認証 & ストレージ

**目標:** データの保存/取得の信頼性と認証フローの正確性を保証

**推定工数:** 3-4 日

### 4.1 認証（P0）

| ファイル                             | テスト内容                                                            |
| :----------------------------------- | :-------------------------------------------------------------------- |
| `lib/auth/cognitoAuth.ts`            | OAuth フロー（リダイレクト/コールバック）、トークン管理、リフレッシュ |
| `hooks/useAuth.ts`                   | 認証状態管理、ログイン/ログアウト、認証エラー                         |
| `components/auth/ProtectedRoute.tsx` | 未認証時のリダイレクト、認証済み時のレンダリング                      |

#### テスト方針

- `cognitoAuth.ts`: `window.location` と `fetch` をモックし、OAuth フロー全体を検証
- `useAuth.ts`: `renderHook` を使用し、認証状態の遷移をテスト
- `ProtectedRoute.tsx`: `@testing-library/react` で条件付きレンダリングを検証

### 4.2 ストレージアダプター（P1）

| ファイル                                             | テスト内容                                |
| :--------------------------------------------------- | :---------------------------------------- |
| `lib/storageAdapter/IndexedDBStorageAdapter.ts`      | CRUD 操作、クエリ、バルク操作、エラー処理 |
| `lib/storageAdapter/createStorageAdapter.ts`         | 設定に応じたアダプターの選択ロジック      |
| `lib/pageRepository/StorageAdapterPageRepository.ts` | ページリポジトリの変換ロジック            |

#### テスト方針

- IndexedDB: `fake-indexeddb` ライブラリを使用してインメモリで検証
- ストレージプロバイダー: 各プロバイダーの API コールをモックして検証

### 4.3 画像ストレージプロバイダー（P2）

| ファイル                                        | テスト内容                          |
| :---------------------------------------------- | :---------------------------------- |
| `lib/storage/providers/S3Provider.ts`           | プリサインド URL 生成、アップロード |
| `lib/storage/providers/GyazoProvider.ts`        | Gyazo API 連携                      |
| `lib/storage/providers/CloudflareR2Provider.ts` | R2 API 連携                         |

---

## 5. Phase 5: フロントエンド コアロジック

**目標:** ビジネスロジックを含むフック・ユーティリティの信頼性を保証

**推定工数:** 4-5 日

### 5.1 AI チャット（P1）

| ファイル                          | テスト内容                                     |
| :-------------------------------- | :--------------------------------------------- |
| `lib/aiChatPrompt.ts`             | プロンプト構築ロジック、コンテキスト注入       |
| `lib/aiChatActions.ts`            | アクション解析（ページ作成、リンク挿入等）     |
| `lib/aiClient.ts`                 | AI クライアントのリクエスト/レスポンス処理     |
| `hooks/useAIChat.ts`              | チャットフロー、メッセージ管理、ストリーミング |
| `hooks/useAIChatConversations.ts` | 会話の永続化、切替、削除                       |
| `stores/aiChatStore.ts`           | チャット状態の管理                             |

### 5.2 コラボレーション（P1）

| ファイル                                    | テスト内容                              |
| :------------------------------------------ | :-------------------------------------- |
| `lib/collaboration/CollaborationManager.ts` | Y.js ドキュメント同期、接続管理、再接続 |
| `hooks/useCollaboration.ts`                 | コラボレーション状態管理                |

#### テスト方針

- Y.js のプロバイダーをモックし、ドキュメント同期のメッセージングを検証
- 接続/切断/再接続のライフサイクルをテスト

### 5.3 ページ操作フック（P1）

| ファイル                   | テスト内容                                           |
| :------------------------- | :--------------------------------------------------- |
| `hooks/usePageQueries.ts`  | ページデータのフェッチ、キャッシュ、ミューテーション |
| `hooks/useNoteQueries.ts`  | ノートデータのフェッチ、キャッシュ                   |
| `hooks/useWebClipper.ts`   | Web クリッピングフロー                               |
| `hooks/useSubscription.ts` | サブスクリプション状態管理                           |

### 5.4 ユーティリティ（P2）

| ファイル                | テスト内容                                  |
| :---------------------- | :------------------------------------------ |
| `lib/webClipper.ts`     | HTML 解析、Readability 変換、メタデータ抽出 |
| `lib/markdownExport.ts` | Tiptap JSON → Markdown 変換の精度           |
| `lib/htmlToTiptap.ts`   | HTML → Tiptap JSON 変換                     |
| `lib/wikiLinkUtils.ts`  | WikiLink 抽出・解析ユーティリティ           |
| `lib/dateUtils.ts`      | 日付フォーマット、グルーピング              |
| `lib/encryption.ts`     | 暗号化/復号化の往復テスト                   |

---

## 6. Phase 6: フロントエンド コンポーネント & インテグレーション

**目標:** ユーザーインタラクションの正確性を保証

**推定工数:** 4-5 日

### 6.1 エディタコンポーネント（P2）

| ファイル                               | テスト内容                           |
| :------------------------------------- | :----------------------------------- |
| `components/editor/TiptapEditor.tsx`   | 初期化、コンテンツ表示、コールバック |
| `components/editor/PageEditorView.tsx` | ページ読み込み/保存フロー            |
| `extensions/WikiLinkExtension.ts`      | WikiLink の挿入/解析/レンダリング    |
| `extensions/MermaidExtension.ts`       | Mermaid ブロックの挿入/レンダリング  |
| `WikiLinkSuggestionLayer.tsx`          | サジェストの表示/選択/フィルタリング |
| `SlashSuggestionLayer.tsx`             | スラッシュコマンドの表示/実行        |
| `EditorBubbleMenu.tsx`                 | バブルメニューの表示/操作            |

#### テスト方針

- Tiptap エディタのインスタンスを `@tiptap/react` の `useEditor` で生成しテスト
- `@testing-library/react` + `userEvent` でユーザー操作をシミュレーション
- 拡張機能はユニットテスト（入出力の JSON 変換）を優先

### 6.2 AI チャット UI（P2）

| ファイル                               | テスト内容                           |
| :------------------------------------- | :----------------------------------- |
| `components/ai-chat/AIChatPanel.tsx`   | パネルの開閉、メッセージ送信、表示   |
| `components/ai-chat/AIChatInput.tsx`   | 入力、送信、キーボードショートカット |
| `components/ai-chat/AIChatMessage.tsx` | メッセージのレンダリング、アクション |

### 6.3 レイアウト & ナビゲーション（P3）

| ファイル                                    | テスト内容                       |
| :------------------------------------------ | :------------------------------- |
| `components/layout/Header/index.tsx`        | ヘッダー表示、ナビゲーション     |
| `components/layout/GlobalShortcutsProvider` | キーボードショートカットの動作   |
| `components/page/PageGrid.tsx`              | グリッドレイアウト、レスポンシブ |
| `components/page/DateSection.tsx`           | 日付セクションのグルーピング     |

---

## 7. Phase 7: E2E テストの拡充

**目標:** 主要ユーザーフローの端到端の動作保証

**推定工数:** 3-4 日

### 7.1 追加 E2E シナリオ

| シナリオ                | 優先度 | 内容                                          |
| :---------------------- | :----- | :-------------------------------------------- |
| AI チャット             | P1     | メッセージ送信 → AI 応答表示 → アクション実行 |
| Web クリッピング        | P1     | URL 入力 → ページ生成 → コンテンツ確認        |
| ノート（共有）          | P1     | ノート作成 → ページ追加 → メンバー招待        |
| 認証フロー              | P2     | サインイン → コールバック → リダイレクト      |
| 設定変更                | P2     | AI 設定/ストレージ設定の変更 → 反映確認       |
| オフライン → オンライン | P2     | オフライン編集 → 再接続 → 同期確認            |
| サブスクリプション      | P3     | プラン選択 → チェックアウト → 機能アンロック  |

### 7.2 E2E テスト環境

- **ツール:** Playwright（既存の構成を継続）
- **認証モック:** `e2e/auth-mock.ts` を拡張
- **API モック:** MSW（Mock Service Worker）の導入を推奨
- **テストデータ:** シードスクリプトによるリセッタブルな状態管理

---

## 8. 実装スケジュール

```
Phase 2: バックエンド ミドルウェア & サービス  ──── 3-4 日
Phase 3: バックエンド 未テストルート            ──── 3-4 日
Phase 4: フロントエンド 認証 & ストレージ       ──── 3-4 日
Phase 5: フロントエンド コアロジック            ──── 4-5 日
Phase 6: フロントエンド コンポーネント          ──── 4-5 日
Phase 7: E2E テスト拡充                         ──── 3-4 日
                                                 ─────────
                                        合計: 20-26 日
```

### 推奨実装順序

```
Phase 2 (ミドルウェア) ─→ Phase 3 (ルート) ─→ Phase 4 (認証/ストレージ)
                                                        │
Phase 5 (コアロジック) ←────────────────────────────────┘
        │
        ├─→ Phase 6 (コンポーネント)
        │
        └─→ Phase 7 (E2E)
```

Phase 2 → 3 はバックエンドで完結するため連続実施が効率的。
Phase 4 は認証とストレージの基盤であり、Phase 5 以降のフロントエンドテストの前提になる。
Phase 6 と 7 は並行作業が可能。

---

## 9. テスト品質基準

**品質指標の優先順位: Mutation スコアを優先し、カバレッジは補助とする。** 閾値は `stryker.config.mjs` の high/low/break を満たすことを優先する。

### 9.1 カバレッジ目標（参考値。Mutation スコアを優先）

| カテゴリ             | 目標（行カバレッジ） | 備考                             |
| :------------------- | :------------------- | :------------------------------- |
| ミドルウェア         | 90%+                 | セキュリティクリティカル         |
| サービスレイヤー     | 85%+                 | ビジネスロジック集中             |
| API ルート           | 80%+                 | 正常系 + 主要エラー系            |
| フロントエンド Lib   | 85%+                 | 純粋なロジック                   |
| フロントエンド Hooks | 75%+                 | 副作用を含むため完全カバーは困難 |
| コンポーネント       | 70%+                 | インタラクション中心にテスト     |
| E2E                  | 主要フロー 100%      | クリティカルパスの全網羅         |

### 9.2 テスト命名規約

```typescript
describe("対象モジュール名", () => {
  describe("メソッド名 or シナリオ", () => {
    it("should 期待される振る舞い when 条件", () => {
      // Arrange → Act → Assert
    });
  });
});
```

### 9.3 CI/CD との統合

| ステージ    | 実行テスト                 | ゲート条件                                             |
| :---------- | :------------------------- | :----------------------------------------------------- |
| PR チェック | ユニット + 統合テスト      | 全テスト合格                                           |
| マージ前    | 上記 + E2E テスト          | 全テスト合格 + Mutation スコア閾値（カバレッジは参考） |
| デプロイ後  | スモークテスト（E2E 一部） | ヘルスチェック + 主要フロー                            |

---

## 10. テスト基盤の改善提案

### 10.1 短期（Phase 2-3 と並行）

- [ ] **カバレッジレポート導入:** `vitest --coverage` を CI に追加し、カバレッジの可視化
- [ ] **テスト用 fixture の整備:** 共通テストデータ（ユーザー、ページ、ノート）をファクトリパターンで管理
- [ ] **`createMockDb` の拡張:** 既存のヘルパーにトランザクション(`transaction`)のモック追加

### 10.2 中期（Phase 4-5 と並行）

- [ ] **MSW 導入:** フロントエンドテストでの API モックを MSW に統一し、テストの信頼性向上
- [ ] **テスト用 React コンテキストプロバイダー:** 認証・ストレージ等を含む `TestProvider` ラッパーの作成
- [ ] **Snapshot テスト:** 主要コンポーネントのレンダリング結果のスナップショット管理

### 10.3 長期（Phase 6-7 以降）

- [ ] **Visual Regression テスト:** Playwright + Percy/Chromatic による UI 変更の検知
- [ ] **パフォーマンステスト:** 大量ページ（1000+）での Date Grid レンダリング速度の計測
- [ ] **Mutation テスト:** テストの品質自体を検証するミューテーションテストの導入

---

## 付録 A: 既存テスト基盤（Phase 1 で構築）

### ヘルパー関数

- **`createMockDb()`** - Drizzle ORM のチェイナブルクエリビルダーをモック
- **`jsonRequest()`** - Hono `app.request` のラッパー（JSON リクエスト簡略化）
- **`MOCK_ENV_CONFIG`** - テスト用環境変数
- **テスト定数** - `TEST_USER_ID`, `OTHER_USER_ID`, `TEST_COGNITO_SUB`, `TEST_USER_EMAIL`

### モックパターン

```typescript
// ミドルウェアのモック（認証バイパス）
vi.mock("../../middleware/auth", () => ({
  authRequired: vi.fn(() => async (c, next) => {
    c.set("userId", TEST_USER_ID);
    c.set("cognitoSub", TEST_COGNITO_SUB);
    c.set("userEmail", TEST_USER_EMAIL);
    await next();
  }),
}));

// DB のモック
const mockDb = createMockDb();
vi.mock("../../middleware/db", () => ({
  dbMiddleware: vi.fn(() => async (c, next) => {
    c.set("db", mockDb);
    await next();
  }),
}));
```

### ファイル配置

```
terraform/modules/api/lambda/src/__tests__/
├── helpers/
│   └── setup.ts          ← 共通ヘルパー
├── routes/
│   ├── pages.test.ts
│   ├── syncPages.test.ts
│   ├── notes.test.ts
│   ├── users.test.ts
│   ├── search.test.ts
│   ├── clip.test.ts
│   └── media.test.ts
└── app.test.ts

src/lib/
├── api/
│   └── apiClient.test.ts
└── sync/
    └── syncWithApi.test.ts
```
