# for-all-learners から zedi へのページデータ移行

**日付**: 2026-01-02

## 概要

旧メモアプリ「for-all-learners」から現在開発中の「zedi」へページデータを移行する作業を実施。

## 実施内容

### 1. 移行スクリプトの作成と実行

#### 1.1 環境調査
- **for-all-learners**: Supabase (PostgreSQL) を使用
- **zedi**: Turso (libSQL/SQLite) + sql.js (ローカルファースト)
- 両アプリともTiptap JSONでコンテンツを保存

#### 1.2 移行対象
- **ソースユーザーID**: `a3b721d3-b4ea-4982-8296-320a27f1a754`
- **ターゲットユーザーID**: `user_37axfEra8z81aMdhOhBMcXMpWeU`
- **移行ページ数**: 1,261ページ

#### 1.3 データ変換
- **タイムスタンプ**: ISO 8601 → Unix ミリ秒
- **Tiptapコンテンツ変換**:
  - `unifiedLink` → `wikiLink` (ページリンクのみ)
  - 外部リンク/タグ → マークを削除（テキストのみ残す）
  - `gyazo-image` → 標準 `image` ノード
  - その他カスタムノード → プレーンテキスト

### 2. 同期処理の改善

#### 2.1 問題点
- 初回同期で全データ（content含む）を一括取得
- リンク同期でN+1問題（ページごとに個別クエリ）
- `getLocalClient` の競合状態（複数回の初期化）

#### 2.2 改善内容

**ページネーション導入**:
```typescript
const SYNC_PAGE_SIZE = 500;
// ページネーションで分割取得
while (hasMore) {
  const result = await remote.execute({
    sql: `SELECT * FROM pages ... LIMIT ? OFFSET ?`,
    args: [userId, syncSince, SYNC_PAGE_SIZE, offset],
  });
  // ...
}
```

**バッチクエリ（N+1解消）**:
```typescript
const BATCH_IN_SIZE = 100;
// IN句でバッチ取得
for (let i = 0; i < allUpdatedIds.length; i += BATCH_IN_SIZE) {
  const batchIds = allUpdatedIds.slice(i, i + BATCH_IN_SIZE);
  const placeholders = batchIds.map(() => "?").join(",");
  const result = await remote.execute({
    sql: `SELECT * FROM links WHERE source_id IN (${placeholders})`,
    args: batchIds as InValue[],
  });
  // ...
}
```

**競合状態の解消**:
```typescript
// 初期化用Promiseロックを追加
let initializationPromise: Promise<Client> | null = null;

export async function getLocalClient(userId: string): Promise<Client> {
  // 既存クライアントがあれば返す
  if (localSqlJsClient && isLocalDbInitialized && currentUserId === userId) {
    return localSqlJsClient;
  }
  
  // 初期化中なら待機
  if (initializationPromise && currentUserId === userId) {
    return initializationPromise;
  }
  
  // 初期化Promiseを作成
  initializationPromise = (async () => {
    // ... 初期化処理
  })();
  
  return initializationPromise;
}
```

### 3. TiptapEditorの初期化問題修正

#### 3.1 問題点
- エディターが空のcontentで初期化される
- `onUpdate` が発火し、空のドキュメントで `onChange` が呼ばれる
- `setContent(空)` で正しいコンテンツが上書きされる

#### 3.2 解決策
```typescript
// 初期化フラグを追加
const isEditorInitializedRef = useRef(false);

// onUpdate で初期化チェック
onUpdate: ({ editor }) => {
  if (!isEditorInitializedRef.current) {
    const currentJson = JSON.stringify(editor.getJSON());
    const isEmpty = currentJson.length <= 50;
    
    if (!isEmpty) {
      isEditorInitializedRef.current = true;
    } else {
      return; // onChange を呼ばない
    }
  }
  const json = JSON.stringify(editor.getJSON());
  onChange(json);
},

// onCreate でコンテンツがあれば初期化済みとマーク
onCreate: () => {
  if (initialParsedContent) {
    isEditorInitializedRef.current = true;
  }
},
```

### 4. SqlJsClientWrapperの型改善（ユーザーによる修正）

ユーザーにより `SqlJsClientWrapper` が `@libsql/client` の `Client` インターフェースを完全に実装するよう改善された。

## 変更ファイル

### 修正されたファイル
- `src/lib/turso.ts` - 同期処理の改善、競合状態の解消、Client型の実装
- `src/lib/pageRepository.ts` - デバッグログ追加/削除
- `src/hooks/usePageQueries.ts` - デバッグログ追加/削除
- `src/components/editor/PageEditorView.tsx` - デバッグログ追加/削除
- `src/components/editor/TiptapEditor.tsx` - 初期化問題の修正

### 削除されたファイル（ユーザーによる）
- `scripts/migrate-from-fal.ts` - 移行スクリプト
- `scripts/check-data.ts` - データ確認スクリプト
- `scripts/delete-migrated-data.ts` - データ削除スクリプト
- `scripts/package.json`
- `scripts/tsconfig.json`
- `scripts/README.md`

## 結果

- **移行完了**: 1,261ページをTursoに正常に移行
- **同期改善**: ページネーション、バッチクエリによる効率化
- **バグ修正**: 
  - ローカルDB初期化の競合状態を解消
  - エディターの初期化問題を修正し、コンテンツが正しく表示されるように

## 今後の課題

1. **Tiptap link 拡張の重複警告**: `[tiptap warn]: Duplicate extension names found: ['link']` が表示される
   - 移行データ内の古い `link` マークと zedi の `Link` 拡張が競合
   - 移行時に外部リンクのマークを削除する対応済みだが、一部残っている可能性

2. **遅延ロードの検討**: 初回同期で全コンテンツを取得する代わりに、必要時にコンテンツを取得する方式
