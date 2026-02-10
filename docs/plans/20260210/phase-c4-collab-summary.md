# Phase C4 および C-Collab 作業サマリー

**作成日:** 2026-02-10  
**参照:** [phase-c4-proposal.md](phase-c4-proposal.md), [phase-c4-work-log.md](phase-c4-work-log.md), [phase-c3-work-log.md](phase-c3-work-log.md)

---

## 1. 概要

本ドキュメントは、Phase C4（Hocuspocus 永続化）および C-Collab（共有ノート / 個人ページの共同編集モード制御）に関する一連の作業をまとめたものです。

| フェーズ | 内容 | 状態 |
|----------|------|------|
| C4-1 | Aurora 永続化 | ✅ 完了 |
| C4-2 | Redis 連携 | ✅ 完了 |
| C4-3 | 認可の統一 | ✅ 完了 |
| C-Collab-1 | 共有ノート内ページのリアルタイム編集 | ✅ 完了 |
| C-Collab-2 | 個人ページは Hocuspocus を使わない | ✅ 完了 |
| インフラ | Terraform ドリフト修正、ECS デプロイ | ✅ 完了 |

---

## 2. Phase C4 実装内容

### 2.1 C4-1: Aurora 永続化

**対象:** `server/hocuspocus/src/index.ts`

- **onLoadDocument:** `documentName`（`page-&lt;uuid&gt;`）から `page_id` を抽出し、`page_contents.ydoc_state` を読み込み、`Y.applyUpdate` で `Y.Doc` を復元。未存在時は空の `Y.Doc` を返却。
- **onStoreDocument:** `Y.encodeStateAsUpdate` を `page_contents` へ UPSERT。`version` を increment。
- **最終切断時保存:** ドキュメント単位の接続数を追跡し、最後のクライアント切断時に明示保存。
- **DB 接続:** `DATABASE_URL`（直接 URL）または `DB_CREDENTIALS_JSON`（Secrets Manager 全体）から接続情報を解決。

### 2.2 C4-2: Redis 連携

**対象:** `server/hocuspocus/src/index.ts`, `package.json`

- `@hocuspocus/extension-redis` を extensions に登録。
- `REDIS_URL` から host/port/password/tls を解釈して接続。
- `@hocuspocus/server` を v3 系に更新し、拡張との型整合を確保。

### 2.3 C4-3: 認可の統一

**対象:** `server/hocuspocus/src/index.ts`

- JWT 検証後、`page_id` 単位の編集可否を DB で判定。
- **共有ノート内ページ:** ノート owner または `note_members.role='editor'` のみ許可。
- **個人ページ（ノートに属さない）:** `pages.owner_id` が本人のときのみ許可。
- 権限不足時は `Forbidden` で接続拒否。

### 2.4 インフラ補正

**対象:** `terraform/modules/realtime/main.tf`

- ECS secret を `DATABASE_URL:host` から `DB_CREDENTIALS_JSON`（secret 全体）へ変更。
- Hocuspocus 側の接続情報解決ロジックと整合。

---

## 3. C-Collab 実装内容

### 3.1 C-Collab-1: 共有ノート内ページのリアルタイム編集

**対象:** `src/pages/NotePageView.tsx`

- `useCollaboration` を `mode: "collaborative"` で有効化。
- `access?.canEdit` に基づき編集可能 / 閲覧専用を切り替え。
- 編集可能時は `PageEditorContent` に `collaboration` を渡し、Hocuspocus に接続。
- 閲覧専用時は `isReadOnly={true}`、`showToolbar={false}`。

### 3.2 C-Collab-2: 個人ページは Hocuspocus を使わない

**対象:** `src/components/editor/PageEditorView.tsx`

- 個人ページ（`/page/:id`）では `useCollaboration` を `mode: "local"` で使用。
- Hocuspocus WebSocket には接続せず、y-indexeddb によるローカル永続化のみ。
- ヘッダーの共同編集 UI（オンライン人数など）は表示しない（`collaboration={undefined}`）。

---

## 4. Terraform ドリフト修正

**目的:** `terraform plan` で検出されていたドリフトを最小修正で解消。

### 4.1 RDS パラメータグループ

**対象:** `terraform/modules/database/main.tf`

- `shared_preload_libraries` に `apply_method = "pending-reboot"` を明示。
- AWS のデフォルト挙動と Terraform の認識差を解消。

### 4.2 Cognito Identity Provider

**対象:** `terraform/modules/security/main.tf`

- **Google IdP:** `provider_details` の以下を `lifecycle.ignore_changes` に追加:
  - `attributes_url`, `attributes_url_add_attributes`, `authorize_url`, `oidc_issuer`, `token_request_method`, `token_url`
- **GitHub IdP:** `provider_details["attributes_url_add_attributes"]` を `ignore_changes` に追加。
- AWS が自動で付与・変更する属性によるドリフトを防止。

---

## 5. フロントエンド修正（React Hook）

**対象:** `src/pages/NotePageView.tsx`

**問題:** `useCollaboration` が条件付き return の後に呼ばれており、「React Hook は条件付きで呼べない」というエラーが発生。

**対応:** `useCollaboration` をコンポーネント先頭の条件付き return より前に移動。`pageId` が未確定の場合は `page?.id ?? ""` を渡し、`enabled` フラグで実際の接続・非接続を制御するように変更。

---

## 6. デプロイ

- **ECS:** dev / prod 両環境に Hocuspocus サーバーをデプロイ済み。
- **Docker:** `server/hocuspocus` をビルドし、ECR へ push 後、ECS サービスを更新。

---

## 7. 変更ファイル一覧

| 種別 | パス |
|------|------|
| サーバー | `server/hocuspocus/src/index.ts` |
| サーバー | `server/hocuspocus/package.json` |
| サーバー | `server/hocuspocus/package-lock.json` |
| インフラ | `terraform/modules/realtime/main.tf` |
| インフラ | `terraform/modules/database/main.tf` |
| インフラ | `terraform/modules/security/main.tf` |
| フロント | `src/pages/NotePageView.tsx` |
| フロント | `src/components/editor/PageEditorView.tsx` |

---

## 8. 残作業（推奨）

1. **統合テスト（C-Collab-1）**
   - 共有ノートを 2 クライアントで同時編集し、切断・再接続後に内容が復元されることを確認。
2. **マルチタスク検証（C4-2）**
   - ECS desired count を 2 以上にして、Redis 経由の更新伝播を確認。
3. **content_text 更新**
   - 必要に応じて Hocuspocus 保存時に `content_text` を抽出・更新（検索品質向上）。
4. **ブラウザ確認（C-Collab-2）**
   - `/page/:id` で編集が通常どおり可能になること、共同編集の接続表示が出ないことを確認。

---

## 9. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [phase-c4-proposal.md](phase-c4-proposal.md) | C4 の設計・タスク詳細 |
| [phase-c4-work-log.md](phase-c4-work-log.md) | C4 実装の作業ログ |
| [phase-c3-work-log.md](phase-c3-work-log.md) | C3 mode local/collaborative の前提 |
