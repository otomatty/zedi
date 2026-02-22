# 同期エラー調査報告書

## 1. エラーの概要

現在開発中のアプリにおいて、APIとの同期処理中に以下のエラーが発生しています。

```
[Sync/API] Failed (attempt 1/3): TypeError: [Sync/API] Invalid sync payload shape. Expected arrays: pages/links/ghost_links, got keys: pages, synced_at
```

このエラーは、クライアントアプリがAPIサーバーから同期データ（`GET /api/sync/pages`）を取得した際、レスポンスのペイロード形式がクライアントの期待する形式と一致していないために発生しています。

## 2. 実装状況の調査結果

### クライアント側の実装 (`src/lib/sync/syncWithApi.ts`)
クライアント側の `normalizeSyncResponse` 関数では、APIからのレスポンスに以下のプロパティが含まれていることを期待しています。

- `pages`: 配列（必須）
- `links`: 配列（必須）
- `ghost_links`: 配列（必須）
- `server_time`: 文字列（任意）

```typescript
// src/lib/sync/syncWithApi.ts の該当箇所
const pages = obj?.pages;
const links = obj?.links;
const ghostLinks = obj?.ghost_links;
const serverTime = obj?.server_time;

if (!Array.isArray(pages) || !Array.isArray(links) || !Array.isArray(ghostLinks)) {
  const keys = obj ? Object.keys(obj).join(", ") : "non-object";
  throw new TypeError(
    `[Sync/API] Invalid sync payload shape. Expected arrays: pages/links/ghost_links, got keys: ${keys}`
  );
}
```

### API側の実装 (`terraform/modules/api/lambda/src/routes/syncPages.ts`)
API側の `GET /api/sync/pages` エンドポイントの実装を確認すると、ページデータ (`pages`) のみを取得して返しており、`links` と `ghost_links` を取得・返却する処理が実装されていません。
また、サーバー時刻を表すキー名が `server_time` ではなく `synced_at` となっています。

```typescript
// terraform/modules/api/lambda/src/routes/syncPages.ts の該当箇所
const rows = await query.orderBy(pages.updatedAt);

return c.json({
  pages: rows,
  synced_at: new Date().toISOString(), // server_time ではなく synced_at を返している
  // links と ghost_links が含まれていない
});
```

## 3. 原因

1. **必須データの欠落**: API側が `links` と `ghost_links` をレスポンスに含めていないため、クライアント側の配列チェック (`Array.isArray`) でエラーとなっています。
2. **キー名の不一致**: サーバー時刻を表すキー名が、クライアント側は `server_time` を期待しているのに対し、API側は `synced_at` を返しています。

## 4. アプリケーションの仕様に基づく解決策

Zediのデータ構造仕様（`docs/specs/zedi-data-structure-spec.md` および `docs/specs/zedi-future-considerations-options.md`）に基づき、以下の通り実装を修正することを推奨します。

### 仕様の確認

1. **ローカルストアの対象**: ローカルに保存するのは「自分のページのみ」です。共有ノートはAPIから都度取得します。
2. **同期方式**: 自分のページのメタデータは「差分同期（タイムスタンプベース）」で行います。
3. **データ構造**: `pages`, `links`, `ghost_links` はそれぞれ独立したテーブルとして管理されています。

### 提案1: API側の修正 (必須)

API側（`terraform/modules/api/lambda/src/routes/syncPages.ts`）で、取得したページに関連する `links` と `ghost_links` を取得して返すように修正します。また、キー名をクライアントが期待する `server_time` に変更します。

```typescript
import { inArray } from 'drizzle-orm';
// ...

const rows = await query.orderBy(pages.updatedAt);
const pageIds = rows.map(r => r.id);

let linksRows = [];
let ghostLinksRows = [];

if (pageIds.length > 0) {
  // 取得したページに関連するリンクを取得
  linksRows = await db.select().from(links).where(inArray(links.sourceId, pageIds));
  // 取得したページに関連するゴーストリンクを取得
  ghostLinksRows = await db.select().from(ghostLinks).where(inArray(ghostLinks.sourcePageId, pageIds));
}

return c.json({
  pages: rows,
  links: linksRows.map(l => ({
    source_id: l.sourceId,
    target_id: l.targetId,
    created_at: l.createdAt.toISOString(),
  })),
  ghost_links: ghostLinksRows.map(g => ({
    link_text: g.linkText,
    source_page_id: g.sourcePageId,
    created_at: g.createdAt.toISOString(),
    original_target_page_id: g.originalTargetPageId,
    original_note_id: g.originalNoteId,
  })),
  server_time: new Date().toISOString(), // synced_at から変更
});
```

### 提案2: クライアント側の修正 (堅牢性の向上)

クライアント側（`src/lib/sync/syncWithApi.ts`）の `normalizeSyncResponse` 関数を修正し、APIからデータが欠落していてもエラーにならないようにフォールバック処理を追加します。これにより、APIのレスポンスが不完全な場合でもアプリがクラッシュするのを防ぎます。

```typescript
const pages = obj?.pages || [];
const links = obj?.links || [];
const ghostLinks = obj?.ghost_links || [];
const serverTime = obj?.server_time || obj?.synced_at; // synced_at も許容する

if (!Array.isArray(pages) || !Array.isArray(links) || !Array.isArray(ghostLinks)) {
  // ...
}
```

### 結論

Zediの仕様では、ページ間のリンク（`links`）と未作成リンク（`ghost_links`）はナレッジネットワークを形成する重要な要素です。同期処理においてこれらのデータが欠落すると、クライアント側で正しいリンク構造を再構築できなくなります。

したがって、**API側で `links` と `ghost_links` を正しく取得して返す修正（提案1）が必須**となります。合わせて、クライアント側の堅牢性を高める修正（提案2）を行うことで、より安定した同期処理を実現できます。
