# 作業ログ: Web Clipping 機能実装

| 項目           | 内容                         |
| :------------- | :--------------------------- |
| **日付**       | 2025 年 12 月 31 日          |
| **機能**       | Web Clipping（URL 取り込み） |
| **Phase**      | Phase 3                      |
| **ステータス** | ✅ 完了                      |

---

## 概要

URL を入力して Web ページの本文を抽出し、編集可能なページとして保存する「Web Clipping」機能を実装しました。

---

## 実装内容

### 新規作成ファイル

| ファイル                                     | 役割                                                  |
| :------------------------------------------- | :---------------------------------------------------- |
| `src/lib/webClipper.ts`                      | URL 取得・Readability.js による本文抽出・OGP 情報取得 |
| `src/lib/htmlToTiptap.ts`                    | HTML→Tiptap JSON 変換                                 |
| `src/hooks/useWebClipper.ts`                 | Web Clipper フック（状態管理）                        |
| `src/components/editor/WebClipperDialog.tsx` | URL 入力ダイアログ UI                                 |
| `src/components/editor/SourceUrlBadge.tsx`   | 引用元 URL 表示バッジ                                 |

### 修正ファイル

| ファイル                                   | 変更内容                                     |
| :----------------------------------------- | :------------------------------------------- |
| `src/components/editor/PageEditorView.tsx` | Web Clipper ダイアログ統合、引用元バッジ表示 |
| `src/components/page/PageCard.tsx`         | クリップページに 🔗 アイコン表示             |

### 追加パッケージ

```bash
bun add @mozilla/readability @tiptap/html
```

- `@mozilla/readability@0.6.0` - Web ページ本文抽出
- `@tiptap/html@3.14.0` - HTML→Tiptap 変換

---

## 機能詳細

### 1. URL 入力ダイアログ

- **トリガー方法:**
  - ヘッダーの 🔗 アイコンボタン（本文が空の場合のみ表示）
  - ドロップダウンメニューの「URL から取り込み」
- **バリデーション:** HTTP/HTTPS URL のみ許可
- **ステータス表示:** 取得中・抽出中の進捗を表示

### 2. Web ページ取り込み処理

- **CORS 対応:** 複数の CORS プロキシ（allorigins.win 等）を使用
- **本文抽出:** `@mozilla/readability` で Reader Mode 変換
- **OGP 取得:** `og:title`, `og:image`, `og:description`, `og:site_name`
- **HTML サニタイズ:** script, style, iframe 等の危険なタグを除去

### 3. Tiptap 変換

- 抽出した HTML を`@tiptap/html`で Tiptap JSON 形式に変換
- 引用元情報（📎 引用元: リンク）を先頭に自動挿入
- 水平線で本文と区切り

### 4. UI 表示

- **PageCard:** クリップしたページには 🔗 アイコンを表示
- **PageEditor:** 引用元 URL バッジをエディタ上部に表示（外部リンク付き）

---

## 技術的な詳細

### webClipper.ts

```typescript
// 主要な関数
export async function clipWebPage(url: string): Promise<ClippedContent>;
export function isValidUrl(url: string): boolean;
export function extractOGPData(doc: Document): OGPData;
export function getClipErrorMessage(error: unknown): string;
```

### ClippedContent 型

```typescript
export interface ClippedContent {
  title: string;
  content: string; // HTML形式
  textContent: string; // プレーンテキスト
  excerpt: string; // 要約
  byline: string | null; // 著者
  siteName: string | null; // サイト名
  thumbnailUrl: string | null;
  sourceUrl: string;
}
```

### エラーハンドリング

| エラー             | メッセージ                                                                 |
| :----------------- | :------------------------------------------------------------------------- |
| 無効な URL         | 「有効な URL を入力してください。」                                        |
| ページ取得失敗     | 「ページの取得に失敗しました。URL を確認してください。」                   |
| 本文抽出失敗       | 「本文の抽出に失敗しました。このページは対応していない可能性があります。」 |
| ネットワークエラー | 「ネットワークエラーが発生しました。接続を確認してください。」             |

---

## 今後の拡張（任意）

- [ ] ブラウザ拡張機能（Chrome/Firefox）
- [ ] 選択テキストのみクリップ
- [ ] PDF 対応
- [ ] YouTube 字幕取り込み

---

## 関連ドキュメント

- [PRD: 2.4.1 Web クリッピング機能](../PRD.md)
- [実装計画書: Web Clipping](../plans/20251231/web-clipping.md)
