# 作業ログ: TursoDB ローカルファースト実装

**日付:** 2026年1月2日
**作業者:** AI Assistant
**関連計画:** `docs/plans/20260102/turso-performance-optimization.md`

---

## 概要

TursoDB の Rows Read を削減するため、完全なローカルファーストアーキテクチャを実装しました。すべての読み書きがローカル WASM データベースで行われ、**通常操作での Rows Read = 0** を達成。

---

## 実装内容

### Phase 1: クエリ最適化

| 変更 | ファイル | 説明 |
| :--- | :------- | :--- |
| `PageSummary` 型追加 | `src/types/page.ts` | content を除外した軽量型 |
| `getPagesSummary()` 追加 | `src/lib/pageRepository.ts` | サマリーのみ取得するメソッド |
| `getPagesByIds()` 追加 | `src/lib/pageRepository.ts` | 特定IDのページのみ取得 |
| `usePagesSummary()` 追加 | `src/hooks/usePageQueries.ts` | サマリー取得フック |
| 検索最適化 | `src/hooks/useGlobalSearch.ts` | サーバーサイド検索対応 |
| WikiLink最適化 | `src/hooks/usePageQueries.ts` | サマリーを使用 |
| リンク計算最適化 | `src/hooks/useLinkedPages.ts` | サマリー + 選択的フェッチ |

### Phase 1.5: ローカルファースト

| 変更 | ファイル | 説明 |
| :--- | :------- | :--- |
| WASM クライアント導入 | `src/lib/turso.ts` | `@libsql/client-wasm` によるローカル DB |
| 同期機能 | `src/lib/turso.ts` | `syncWithRemote()`, `isSyncStale()` |
| ローカルファースト対応 | `src/hooks/usePageQueries.ts` | すべての操作をローカル優先に |
| 同期インジケーター | `src/components/layout/SyncIndicator.tsx` | 同期状態表示 UI |
| ヘッダー更新 | `src/components/layout/Header.tsx` | SyncIndicator 追加 |
| Vite 設定 | `vite.config.ts` | WASM プラグイン追加 |

---

## 追加パッケージ

```bash
bun add @libsql/client-wasm vite-plugin-wasm vite-plugin-top-level-await
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                      ブラウザ                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           ローカル WASM データベース                       │  │
│  │          (@libsql/client-wasm + IndexedDB)                │  │
│  │                                                           │  │
│  │  ✓ すべての読み書き → ローカル (Rows Read = 0)            │  │
│  │  ✓ IndexedDB永続化 (リロード後もデータ維持)               │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │ バックグラウンド同期                   │
│                         ↓ (認証ユーザーのみ、60秒間隔)          │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ↓
┌───────────────────────────────────────────────────────────────────┐
│                    リモート Turso DB                              │
│                  (マルチデバイス同期用)                           │
└───────────────────────────────────────────────────────────────────┘
```

---

## 動作フロー

### 読み書き操作

1. ユーザーがページを閲覧/編集
2. ローカル WASM データベースで即座に処理
3. IndexedDB に自動永続化
4. **Rows Read = 0**

### 差分同期（Delta Sync）

1. **トリガー**: ページ読み込み時（セッション初回のみ）+ 手動同期ボタン
2. **バックグラウンド自動同期なし** - ユーザーが明示的に同期
3. **差分のみ取得**: `updated_at > lastSyncTime` のデータのみリクエスト
4. コンフリクト解決：`updated_at` が新しい方を優先

---

## 効果

| 操作 | 改善前 | 改善後 |
| :--- | :----- | :----- |
| ページリスト表示 | Rows Read発生 | **0** |
| ページ詳細表示 | Rows Read発生 | **0** |
| 検索 | Rows Read発生 | **0** |
| ページ作成/更新 | Rows Read発生 | **0** |
| 初回同期 | 全データ | 全データ（1回のみ） |
| 差分同期 | 全データ | **変更分のみ（Rows Read最小）** |

---

## 試行錯誤

### 1. オプション検討

| オプション | 説明 | 結果 |
| :--------- | :--- | :--- |
| A: シンプルキャッシュ | `@libsql/client/web` + IndexedDB | ❌ `:memory:` 未サポート |
| B: React Query キャッシュ | メモリ内キャッシュのみ | ❌ 永続化なし |
| C: Embedded Replicas | `@libsql/client-wasm` + syncUrl | ❌ WASM MIME type エラー |
| **D: ローカルファースト** | `@libsql/client-wasm` + 手動同期 | ✅ 採用 |

### 2. WASM 関連の問題と解決

| 問題 | 解決策 |
| :--- | :----- |
| Top-level await エラー | `vite.config.ts` に `build.target: "esnext"` 追加 |
| WASM MIME type エラー | `vite-plugin-wasm`, `vite-plugin-top-level-await` 追加 |
| `:memory:` 未サポート | `@libsql/client-wasm` を使用（WASM 版は `:memory:` サポート） |

### 3. 同期の最適化

| 問題 | 解決策 |
| :--- | :----- |
| ページリロード時に毎回同期 | `isSyncStale()` チェックを `getLocalClient()` 後に移動 |
| `lastSyncTime` が復元前にチェック | `getLocalClient()` 内で復元後にチェック |

---

## 確認事項

- [x] TypeScript ビルド成功
- [x] ブラウザでページ表示
- [x] ページ作成成功
- [x] IndexedDB からの復元成功
- [x] 60秒以内のリロードで同期スキップ
- [x] コンソールに `[LocalDB] Restored from IndexedDB` 表示

---

## 更新ドキュメント

- `docs/plans/20260102/turso-performance-optimization.md` - 実装計画書
- `docs/PRD.md` - Phase 5 完了、7.1 アーキテクチャ更新

---

## 次のステップ

1. **同期間隔の調整**（必要に応じて）
   - 現在: 60秒
   - オプション: 5分、30分、または手動のみ

2. **同期状態 UI の改善**
   - 最終同期時刻の表示
   - 同期エラー時のリトライ UI

3. **Tauri 移行時**
   - ネイティブ SQLite への置き換え
   - さらなるパフォーマンス向上
