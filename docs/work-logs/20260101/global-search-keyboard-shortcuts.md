# 作業ログ: Global Search & キーボードショートカット実装

**日付:** 2026 年 1 月 1 日  
**フェーズ:** Phase 4 - Search & Discovery

---

## 概要

PRD の Phase 4「Search & Discovery」の主要機能を実装し、完了した。

- Global Search（Omni-bar）の実装
- グローバルキーボードショートカットの実装
- ショートカット一覧ダイアログの実装

---

## 実装内容

### 1. Global Search（Omni-bar）

`Cmd+K` / `Ctrl+K` で起動するコマンドパレット型の検索 UI を実装。

#### 作成ファイル

| ファイル                                 | 説明                                                   |
| :--------------------------------------- | :----------------------------------------------------- |
| `src/hooks/useDebouncedValue.ts`         | 検索入力のデバウンス処理（100ms）                      |
| `src/hooks/useGlobalSearchShortcut.ts`   | `Cmd+K` / `Ctrl+K` ショートカットのハンドリング        |
| `src/hooks/useGlobalSearch.ts`           | 検索ロジック（スコアリング、スニペット抽出）           |
| `src/components/search/GlobalSearch.tsx` | コマンドパレット UI（shadcn/ui の CommandDialog 使用） |

#### 機能

- **検索対象:** ページタイトル、ページ本文（Tiptap JSON からテキスト抽出）
- **検索方式:** 部分一致（大文字小文字を区別しない）
- **ソート:** 関連度スコア（タイトル完全一致 > タイトル前方一致 > タイトル部分一致 > 本文一致）+ 更新日時
- **表示件数:** 最大 10 件
- **スニペット:** 検索キーワード周辺の文脈を表示（Smart Snippet）

#### UI

- 検索クエリがない場合: 「最近のページ」を 5 件表示
- 検索クエリがある場合: 検索結果をスニペット付きで表示
- Web クリップしたページは 🔗 アイコンで区別

---

### 2. キーボードショートカット

グローバルに有効なキーボードショートカットを実装。

#### 作成ファイル

| ファイル                                            | 説明                                                  |
| :-------------------------------------------------- | :---------------------------------------------------- |
| `src/hooks/useKeyboardShortcuts.ts`                 | グローバルショートカットのフック + ショートカット定義 |
| `src/components/layout/KeyboardShortcutsDialog.tsx` | ショートカット一覧ダイアログ                          |
| `src/components/layout/GlobalShortcutsProvider.tsx` | ショートカット機能のプロバイダー                      |

#### 実装したショートカット

| ショートカット     | 操作                     |
| :----------------- | :----------------------- |
| `Cmd+K` / `Ctrl+K` | Global Search を開く     |
| `Cmd+N` / `Ctrl+N` | 新規ページを作成         |
| `Cmd+H` / `Ctrl+H` | ホームに戻る             |
| `Cmd+/` / `Ctrl+/` | ショートカット一覧を表示 |

#### 特記事項

- 入力フィールド（input, textarea, contenteditable）内でも `Cmd+N`, `Cmd+H`, `Cmd+/` は動作する
- プラットフォームに応じてキー表示を自動切り替え（Mac: ⌘, Windows/Linux: Ctrl+）

---

### 3. Header UI 更新

#### 変更ファイル

| ファイル                           | 変更内容                                           |
| :--------------------------------- | :------------------------------------------------- |
| `src/components/layout/Header.tsx` | SearchBar を削除、キーボードアイコンボタンを追加   |
| `src/App.tsx`                      | `GlobalSearch` と `GlobalShortcutsProvider` を追加 |

#### 削除ファイル

| ファイル                              | 理由                                   |
| :------------------------------------ | :------------------------------------- |
| `src/components/search/SearchBar.tsx` | Global Search に置き換えられたため不要 |

---

## ファイル構成（新規・変更）

```
src/
├── App.tsx                                    # 変更: GlobalSearch, GlobalShortcutsProvider 追加
├── components/
│   ├── layout/
│   │   ├── GlobalShortcutsProvider.tsx       # 新規
│   │   ├── Header.tsx                         # 変更: SearchBar 削除, キーボードボタン追加
│   │   └── KeyboardShortcutsDialog.tsx       # 新規
│   └── search/
│       ├── GlobalSearch.tsx                   # 新規
│       └── SearchBar.tsx                      # 削除
└── hooks/
    ├── useDebouncedValue.ts                   # 新規
    ├── useGlobalSearch.ts                     # 新規
    ├── useGlobalSearchShortcut.ts             # 新規
    └── useKeyboardShortcuts.ts                # 新規
```

---

## 動作確認

1. ✅ `Cmd+K` で Global Search が開く
2. ✅ 検索クエリを入力すると結果がリアルタイムで表示される
3. ✅ ↑↓ キーで結果を選択、Enter で該当ページに遷移
4. ✅ Esc で検索を閉じる
5. ✅ `Cmd+N` で新規ページに遷移
6. ✅ `Cmd+H` でホームに戻る
7. ✅ `Cmd+/` でショートカット一覧が表示される
8. ✅ ヘッダーのキーボードアイコンでも一覧が表示される

---

## トラブルシューティング

### node_modules 問題

実装中にビルドが進まない問題が発生。原因はゾンビ化した esbuild プロセス。

**解決方法:**

```bash
pkill -9 -f esbuild
rm -rf node_modules
bun install
```

---

## PRD 更新内容

- Phase 4 のステータスを「🔄 現在のフェーズ」から「✅ 完了」に変更
- Phase 5 を「🔄 現在のフェーズ」に更新
- Tauri 移行計画のチェックリストを更新（AI 機能、Global Search、キーボードショートカットを ✅ に）

---

## 次のステップ

Phase 5「Sync & Multi-Device」の作業:

1. Turso JWT 認証の完成（Clerk 連携）
2. Turso リアルタイム同期の実装

または、Phase 4 の残タスク:

1. Backlinks / 2-hop Links の表示（🟡 推奨）
2. Semantic Search（🟢 任意）
