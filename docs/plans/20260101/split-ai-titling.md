# 実装計画書: Split & AI Titling（分割時の自動タイトル生成）

## 概要

| 項目       | 内容                                                                       |
| :--------- | :------------------------------------------------------------------------- |
| **機能名** | Split & AI Titling（分割時の自動タイトル生成）                             |
| **目的**   | テキストの一部を選択して新規ページに分割する際、AI がタイトルを自動生成    |
| **優先度** | 🟡 推奨（Phase 2 の保留機能）                                              |
| **依存**   | AI 設定機能（✅ 実装済み）、Wiki Generator のプロンプト設計（✅ 実装済み） |

---

## 機能要件

### ユーザーストーリー

1. ユーザーはエディタ内でテキスト（段落やブロック）を選択する
2. 選択メニューに「新規ページとして切り出す」オプションが表示される
3. ユーザーがオプションを選択すると、以下が実行される：
   - 選択テキストが新規ページのコンテンツとして作成される
   - AI が選択テキストの内容を解析し、適切なタイトルを自動生成
   - 元の場所には `[[新規ページタイトル]]` のリンクが自動挿入される
4. ユーザーは生成されたタイトルをそのまま使用するか、編集できる

### 分割仕様

| 項目               | 内容                                                       |
| :----------------- | :--------------------------------------------------------- |
| **対象テキスト**   | 選択されたテキストブロック（最低 10 文字以上）             |
| **AI タイトル生成** | 選択テキストの内容を解析し、20 文字以内の要約タイトルを生成 |
| **リンク自動挿入** | 元の位置に `[[タイトル]]` 形式のリンクを自動挿入           |
| **フォールバック** | AI 生成失敗時は先頭 40 文字をタイトルとして使用            |

---

## UI 設計

### 選択メニュー（コンテキストメニュー）

```
テキストを選択した状態：

  ┌─────────────────────────────────────┐
  │ 機械学習とは、コンピュータが        │
  │ ████████████████████████████████    │ ← 選択中
  │ █データから学習し、予測や判断を█    │
  │ █行う能力を獲得する手法です。  █    │
  │ ████████████████████████████████    │
  │                                     │
  └─────────────────────────────────────┘

  選択メニューが表示：

  ┌────────────────────────────┐
  │ 🔗 リンクを作成            │
  │ ✂️  新規ページに切り出す   │ ← 新機能
  │ 📊 Mermaid図を生成         │
  │ ─────────────────────────  │
  │ B 太字                     │
  │ I 斜体                     │
  └────────────────────────────┘
```

### 分割実行後のダイアログ

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ✨ 新規ページを作成                                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ タイトル:                                             │  │
│  │ ┌─────────────────────────────────────────────────┐   │  │
│  │ │ 機械学習の基本概念                       ✏️     │   │  │ ← AI 生成
│  │ └─────────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │ プレビュー:                                           │  │
│  │ ┌─────────────────────────────────────────────────┐   │  │
│  │ │ データから学習し、予測や判断を行う能力を        │   │  │
│  │ │ 獲得する手法です。                              │   │  │
│  │ └─────────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │ 元の場所には [[機械学習の基本概念]] が挿入されます    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│                         [キャンセル]  [作成して開く]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 技術設計

### AI タイトル生成プロンプト

```typescript
// lib/aiTitleGenerator.ts

export async function generateTitleFromContent(
  content: string,
  aiSettings: AISettings
): Promise<string> {
  const systemPrompt = `あなたは文章からタイトルを生成するアシスタントです。
与えられたテキストの内容を要約し、20文字以内の簡潔なタイトルを生成してください。

ルール:
- タイトルのみを返す（説明や補足は不要）
- 20文字以内
- 内容の本質を捉える
- 日本語の場合は日本語、英語の場合は英語で返す`;

  const userPrompt = `以下のテキストに適切なタイトルを付けてください:\n\n${content}`;

  // 既存の AI クライアントを使用
  const response = await generateAIResponse(systemPrompt, userPrompt, aiSettings);
  
  return response.trim().slice(0, 40); // 安全のため最大40文字
}
```

### 分割ロジック

```typescript
// lib/splitUtils.ts

export interface SplitResult {
  title: string;
  content: string;
  linkPosition: { from: number; to: number };
}

export async function splitTextToNewPage(
  selectedText: string,
  aiSettings: AISettings | null
): Promise<SplitResult> {
  let title: string;

  // AI 設定がある場合は AI でタイトル生成
  if (aiSettings?.apiKey) {
    try {
      title = await generateTitleFromContent(selectedText, aiSettings);
    } catch (error) {
      console.error("AI title generation failed:", error);
      // フォールバック: 先頭文字列を使用
      title = generateAutoTitle(selectedText);
    }
  } else {
    // AI 設定がない場合はフォールバック
    title = generateAutoTitle(selectedText);
  }

  return {
    title,
    content: selectedText,
  };
}
```

### エディタ統合

```typescript
// components/editor/SplitSelectionMenu.tsx

interface SplitSelectionMenuProps {
  selectedText: string;
  onSplit: (title: string, content: string) => void;
  onClose: () => void;
}

export function SplitSelectionMenu({ selectedText, onSplit, onClose }: SplitSelectionMenuProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const { settings: aiSettings } = useAISettings();

  useEffect(() => {
    const generateTitle = async () => {
      setIsGenerating(true);
      try {
        const result = await splitTextToNewPage(selectedText, aiSettings);
        setGeneratedTitle(result.title);
        setCustomTitle(result.title);
      } catch (error) {
        console.error("Title generation failed:", error);
        const fallback = generateAutoTitle(selectedText);
        setGeneratedTitle(fallback);
        setCustomTitle(fallback);
      } finally {
        setIsGenerating(false);
      }
    };

    if (selectedText.length >= 10) {
      generateTitle();
    }
  }, [selectedText, aiSettings]);

  const handleSplit = () => {
    onSplit(customTitle || generatedTitle, selectedText);
  };

  // ... UI 実装
}
```

### TiptapEditor への統合

```typescript
// TiptapEditor.tsx への追加

// 選択メニューに「新規ページに切り出す」を追加
const handleSplitToNewPage = useCallback(async () => {
  if (!editor) return;

  const { from, to } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, '\n');

  if (selectedText.length < 10) {
    toast({
      title: "テキストが短すぎます",
      description: "10文字以上のテキストを選択してください",
      variant: "destructive",
    });
    return;
  }

  // 分割ダイアログを開く
  setSelectedTextForSplit(selectedText);
  setSplitSelectionRange({ from, to });
  setSplitDialogOpen(true);
}, [editor, toast]);

// 分割実行時の処理
const executeSplit = useCallback(async (title: string, content: string) => {
  if (!editor || !splitSelectionRange) return;

  // 1. 新規ページを作成
  const newPage = await createPageMutation.mutateAsync({
    title,
    content: JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: content }] }]
    }),
  });

  // 2. 選択部分を WikiLink に置換
  editor
    .chain()
    .focus()
    .setTextSelection(splitSelectionRange)
    .deleteSelection()
    .insertContent({
      type: "text",
      text: title,
      marks: [
        {
          type: "wikiLink",
          attrs: { title, exists: true },
        },
      ],
    })
    .run();

  // 3. 変更を保存
  onChange(JSON.stringify(editor.getJSON()));

  // 4. 新規ページに遷移するか確認
  toast({
    title: "ページを作成しました",
    description: `「${title}」を作成しました`,
    action: (
      <ToastAction altText="開く" onClick={() => navigate(`/page/${newPage.id}`)}>
        開く
      </ToastAction>
    ),
  });

  setSplitDialogOpen(false);
  setSplitSelectionRange(null);
}, [editor, createPageMutation, navigate, onChange, splitSelectionRange, toast]);
```

---

## ファイル構成

```
src/
├── components/
│   └── editor/
│       ├── TiptapEditor.tsx          # 分割機能の統合（修正）
│       ├── SplitDialog.tsx           # 分割確認ダイアログ（新規）
│       └── SelectionMenu.tsx         # 選択メニュー（修正/新規）
├── hooks/
│   └── useSplitPage.ts               # 分割ロジックフック（新規）
└── lib/
    ├── aiTitleGenerator.ts           # AI タイトル生成（新規）
    └── splitUtils.ts                 # 分割ユーティリティ（新規）
```

---

## 実装ステップ

| Step | 内容                                             | 見積もり |
| :--- | :----------------------------------------------- | :------- |
| 1    | AI タイトル生成プロンプトと関数の実装            | 1.5 時間 |
| 2    | splitUtils.ts の実装（分割ロジック）             | 1 時間   |
| 3    | SplitDialog コンポーネントの実装                 | 2 時間   |
| 4    | TiptapEditor への選択メニュー追加                | 1.5 時間 |
| 5    | 選択テキストから WikiLink への置換処理           | 1.5 時間 |
| 6    | 新規ページ作成との統合                           | 1 時間   |
| 7    | エラーハンドリングとフォールバック               | 1 時間   |
| 8    | テストと調整                                     | 1.5 時間 |

**合計見積もり: 約 11 時間**

---

## 考慮事項

### エッジケース

| ケース                       | 対応                                                   |
| :--------------------------- | :----------------------------------------------------- |
| 選択テキストが 10 文字未満   | エラーメッセージを表示し、分割を実行しない             |
| AI API キーが未設定          | 先頭 40 文字をタイトルとして使用（フォールバック）     |
| AI 生成がタイムアウト        | 5 秒でタイムアウトし、フォールバックを使用             |
| 生成タイトルが既存ページと重複 | 重複チェックを実行し、警告を表示（保存は可能）         |
| 選択範囲にリンクが含まれる   | リンク情報も含めて新規ページに移動                     |

### パフォーマンス

- AI タイトル生成は非同期で実行し、UI をブロックしない
- 生成中はローディング表示を出す
- キャンセル可能にする

---

## 将来の拡張

1. **ドラッグ＆ドロップ分割 (Magic Split)**: テキストブロックを余白にドラッグして分割
2. **モバイル対応 (Flick-to-Split)**: 段落を右フリックして切り出し
3. **複数ブロック選択**: 複数の段落をまとめて分割
4. **分割履歴**: 分割元と分割先の関係を追跡

---

## 関連ドキュメント

- [PRD: 2.3 エディタ機能 - Smart Splitting](../PRD.md#23-エディタ機能-frictionless-page-editor)
- [PRD: 2.5 AI 機能 - Contextual Titling](../PRD.md#25-ai-機能-structural-intelligence---byok-bring-your-own-key)
