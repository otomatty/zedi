# Wiki Generator & Mermaid ダイアグラム機能 実装ログ

**作業日**: 2025 年 12 月 31 日

## 概要

Zedi メモアプリに以下の 2 つの機能を実装しました：

1. **Wiki Generator**: AI による Wikipedia 風コンテンツ生成（ストリーミング対応）
2. **Mermaid ダイアグラム**: テキスト選択からの AI ダイアグラム生成・レンダリング

---

## 1. Wiki Generator 機能

### 実装ファイル

| ファイル                                        | 説明                                    |
| ----------------------------------------------- | --------------------------------------- |
| `src/lib/wikiGenerator.ts`                      | Wiki 生成ロジック（ストリーミング対応） |
| `src/hooks/useWikiGenerator.ts`                 | React Hook                              |
| `src/components/editor/WikiGeneratorButton.tsx` | 生成ボタン UI                           |
| `src/components/editor/PageEditorView.tsx`      | 統合（修正）                            |
| `src/components/ui/dialog.tsx`                  | hideCloseButton prop 追加               |

### 機能仕様

- **表示条件**: タイトルが入力済み AND 本文が空の場合のみボタン表示
- **AI 未設定時**: 設定画面への誘導ダイアログを表示
- **ストリーミング**: リアルタイムで生成内容をプレビュー表示
- **キャンセル**: 生成中にキャンセル可能
- **適用**: 生成完了後、「適用」ボタンでエディタに反映

### プロンプト改善履歴

1. **初期実装**: 200〜500 字の簡潔な解説
2. **詳細化**: 800〜1500 字、記事構成ガイドライン追加（概念/人物/技術/出来事に対応）
3. **参照元追加**: 脚注形式（[^1]）で出典を記載
4. **インラインリンク形式へ変更**: 脚注をやめ、本文中に直接リンクを埋め込む形式に

### Markdown→Tiptap 変換

`convertMarkdownToTiptapContent()`関数で以下を処理：

- 見出し（#, ##, ###）
- 箇条書き（-, \*）
- WikiLink（[[キーワード]]）
- 外部リンク（[テキスト](URL)）
- 太字（**text**）
- 斜体（_text_）

### 外部リンク対応

Tiptap エディタの Link 設定を修正：

```typescript
Link.configure({
  openOnClick: true,
  HTMLAttributes: {
    class: "external-link text-blue-600 hover:underline cursor-pointer",
    target: "_blank",
    rel: "noopener noreferrer",
  },
});
```

---

## 2. Mermaid ダイアグラム機能

### 実装ファイル

| ファイル                                               | 説明                               |
| ------------------------------------------------------ | ---------------------------------- |
| `src/components/editor/extensions/MermaidExtension.ts` | Tiptap 用 Mermaid ノード拡張       |
| `src/components/editor/MermaidNodeView.tsx`            | Mermaid レンダリングコンポーネント |
| `src/lib/mermaidGenerator.ts`                          | AI 生成ロジック                    |
| `src/hooks/useMermaidGenerator.ts`                     | React Hook                         |
| `src/components/editor/MermaidGeneratorDialog.tsx`     | ダイアログ UI                      |
| `src/components/editor/TiptapEditor.tsx`               | 統合（修正）                       |

### 依存パッケージ

```bash
bun add mermaid
```

### 対応ダイアグラムタイプ（複数選択可）

| タイプ         | ID             | 説明                                   |
| -------------- | -------------- | -------------------------------------- |
| フローチャート | `flowchart`    | 処理の流れや手順を表現                 |
| シーケンス図   | `sequence`     | オブジェクト間のやり取りを時系列で表現 |
| クラス図       | `classDiagram` | クラスの構造と関係を表現               |
| 状態遷移図     | `stateDiagram` | 状態の変化と遷移条件を表現             |
| ER 図          | `erDiagram`    | エンティティ間の関係を表現             |
| ガントチャート | `gantt`        | プロジェクトのスケジュールを表現       |
| 円グラフ       | `pie`          | 割合や構成比を表現                     |
| マインドマップ | `mindmap`      | アイデアや概念の関連を表現             |

### 使い方

1. エディタでテキストを**10 文字以上**選択
2. 表示される「ダイアグラム生成」ボタンをクリック
3. ダイアログでダイアグラムタイプを選択（複数可）
4. 「ダイアグラムを生成」をクリック
5. プレビューを確認して「挿入」

### MermaidNodeView の機能

- **レンダリング**: mermaid.js で SVG に変換
- **編集**: インライン編集モード
- **削除**: ノード削除
- **フルスクリーン**: ダイアログで拡大表示
- **エラー表示**: 構文エラー時にメッセージと修正ボタン表示

### 選択メニューの実装

BubbleMenu の代わりに自前の選択メニューを実装：

- `onSelectionUpdate`イベントで選択を監視
- 10 文字以上選択時にメニューを表示
- 選択位置に合わせてポジショニング

---

## 技術的な注意点

### 1. Dialog hideCloseButton prop

生成中にダイアログを閉じられないようにするため、shadcn/ui の Dialog コンポーネントに`hideCloseButton`プロパティを追加：

```tsx
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
  }
>(({ className, children, hideCloseButton, ...props }, ref) => (
  // ...
  {!hideCloseButton && (
    <DialogPrimitive.Close ... />
  )}
))
```

### 2. ESLint エラー修正

正規表現内の不要なエスケープを修正：

```typescript
// Before
const externalLinkRegex = /(?<!\[)\[([^\[\]]+)\]\(([^)]+)\)/g;
// After
const externalLinkRegex = /(?<!\[)\[([^[\]]+)\]\(([^)]+)\)/g;
```

### 3. AI Provider 対応

両機能とも OpenAI / Anthropic / Google AI に対応：

- Wiki Generator: ストリーミング API 使用
- Mermaid Generator: 通常の API 使用（レスポンスが短いため）

---

## 今後の改善案

1. **Wiki Generator**

   - 生成内容の編集機能
   - 追記モード（既存コンテンツに追加）
   - テンプレート選択機能

2. **Mermaid ダイアグラム**
   - ダイアグラムの再編集機能強化
   - エクスポート機能（PNG/SVG）
   - ダイアグラムコードのシンタックスハイライト
