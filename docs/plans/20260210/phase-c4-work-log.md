# Phase C4 作業ログ（Hocuspocus 永続化）

**作業日:** 2026-02-10  
**参照:** `phase-c4-proposal.md`, `phase-c3-work-log.md`

---

## 1. 実装確認結果（着手前）

- `server/hocuspocus/src/index.ts`
  - `onLoadDocument` / `onStoreDocument` はログのみで、Aurora 永続化未実装。
  - `onAuthenticate` は Cognito JWT 検証のみで、ページ単位の認可未実装。
  - Redis は `REDIS_URL` ログ表示のみで、Hocuspocus 拡張未接続。
- `terraform/modules/realtime/main.tf`
  - ECS secret の `DATABASE_URL` が `:host::` 参照になっており、PostgreSQL 接続文字列としては不十分。

---

## 2. 今回の実装内容

### 2.1 C4-1: Aurora 永続化（実装）

- `server/hocuspocus/src/index.ts`
  - `pg` + `yjs` を利用した永続化を追加。
  - `onLoadDocument`
    - `documentName` (`page-<uuid>`) から `page_id` を抽出。
    - `page_contents.ydoc_state` を読み込み、`Y.applyUpdate` で `Y.Doc` を復元。
    - データ未存在時は空 `Y.Doc` を返却。
  - `onStoreDocument`
    - `Y.encodeStateAsUpdate` を `page_contents` へ UPSERT。
    - 既存行は `version = version + 1`。
  - 最終切断時保存
    - ドキュメント単位の接続数を追跡し、最後のクライアント切断時に明示保存。
  - DB接続設定
    - `DATABASE_URL`（postgres URL）または `DB_CREDENTIALS_JSON`（Secrets Manager JSON）から接続情報を解決。

### 2.2 C4-2: Redis 連携（実装）

- `server/hocuspocus/src/index.ts`
  - `@hocuspocus/extension-redis` を `extensions` に登録。
  - `REDIS_URL` から host/port/password/tls を解釈して接続オプションを生成。
- `server/hocuspocus/package.json`
  - `@hocuspocus/extension-redis` を追加。
  - `@hocuspocus/server` を extension と同系列に更新（v3 系）し、型不整合を解消。

### 2.3 C4-3: 認可統一（実装）

- `server/hocuspocus/src/index.ts`
  - `onAuthenticate` で JWT 検証後、`page_id` 単位の編集可否を DB で判定。
  - 判定ルール:
    - ページが共有ノートに含まれる場合: ノート owner または `note_members.role='editor'` のみ許可。
    - 共有ノートに含まれないページ（個人ページ）: `pages.owner_id` が本人のときのみ許可。
  - 権限不足時は `Forbidden` を返して接続拒否。

### 2.4 インフラ補正（実装）

- `terraform/modules/realtime/main.tf`
  - ECS secret 注入を `DATABASE_URL:host` から `DB_CREDENTIALS_JSON`（secret 全体）へ変更。
  - Hocuspocus 側の接続情報解決ロジックと整合。

---

## 3. 検証

- `server/hocuspocus`
  - `npm run build` 成功（TypeScript コンパイル OK）。

---

## 4. 変更ファイル

- `server/hocuspocus/src/index.ts`
- `server/hocuspocus/package.json`
- `server/hocuspocus/package-lock.json`
- `terraform/modules/realtime/main.tf`
- `docs/plans/20260210/phase-c4-work-log.md`

---

## 5. 残作業（推奨）

1. **統合テスト**
   - 実際に 2 クライアント接続で編集 → 切断 → 再接続で復元確認。
2. **マルチタスク検証**
   - ECS desired count を 2 以上にして Redis 経由の更新伝播確認。
3. **content_text 更新**
   - 必要なら Hocuspocus 保存時に `content_text` 抽出更新を追加（検索品質向上）。

