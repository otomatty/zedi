# 実装計画書: Wiki Generator

## 概要

| 項目       | 内容                                                      |
| :--------- | :-------------------------------------------------------- |
| **機能名** | Wiki Generator（AI Node Scaffolding）                     |
| **目的**   | タイトルから Wikipedia 風の解説と関連リンクを自動生成する |
| **優先度** | 🔴 必須（Phase 2 のコア機能）                             |
| **依存**   | LLM API 設定画面（`llm-api-settings.md`）                 |

---

## 機能要件

### コンセプト: 「足場としての AI」

> AI は「正解」を書くためではなく、ユーザーがリンクを繋げるための「点（ノード）」を瞬時に生み出す役割を担う。
> — PRD 1.1 デザイン原則

### ユーザーストーリー

1. ユーザーは新規ページを作成し、タイトルを入力する
2. 「Wiki 生成」ボタンをクリックする
3. AI がタイトルに関する簡潔な解説を生成する
4. 解説には関連キーワードへの WikiLink `[[キーワード]]` が含まれる
5. ユーザーは生成された内容を編集・追記できる
6. WikiLink をクリックすると、そのキーワードで新規ページを作成できる

### 出力仕様

| 項目            | 内容                              |
| :-------------- | :-------------------------------- |
| **解説の長さ**  | 200〜500 字（1 画面に収まる分量） |
| **WikiLink 数** | 3〜7 個の関連キーワード           |
| **トーン**      | 百科事典風、客観的、簡潔          |
| **言語**        | ユーザーのタイトルと同じ言語      |

---

## UI 設計

### トリガー方法

1. **新規ページ作成時**: タイトル入力後に「✨ Wiki 生成」ボタン
2. **既存ページ**: 空のページで「✨ Wiki 生成」ボタン

### 新規ページ作成フロー

```
┌─────────────────────────────────────────────────────────────┐
│  ← 新規ページ                                    [保存]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  タイトル                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 機械学習                                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────────────────────────────────────────┐         │
│  │  ✨ Wiki 生成   │  このタイトルについて解説を生成   │         │
│  └───────────────────────────────────────────────┘         │
│                                                             │
│  ─────────────────────────────────────────────────────     │
│                                                             │
│  [エディタ領域]                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 生成中の表示

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⏳ 生成中...                                        │   │
│  │                                                     │   │
│  │  「機械学習」について解説を生成しています。          │   │
│  │  しばらくお待ちください。                           │   │
│  │                                                     │   │
│  │  [キャンセル]                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 生成結果の例

```
┌─────────────────────────────────────────────────────────────┐
│  ← 機械学習                                      [保存]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  **機械学習**（Machine Learning）は、[[人工知能]] の一分野  │
│  であり、コンピュータがデータから学習し、明示的にプログラム │
│  されることなくタスクを実行できるようにする技術である。     │
│                                                             │
│  ## 主要な手法                                              │
│                                                             │
│  - **[[教師あり学習]]**: ラベル付きデータを用いて学習       │
│  - **[[教師なし学習]]**: ラベルなしデータからパターンを発見 │
│  - **[[強化学習]]**: 報酬を最大化する行動を学習             │
│                                                             │
│  ## 応用分野                                                │
│                                                             │
│  [[画像認識]]、[[自然言語処理]]、[[レコメンデーション]]     │
│  などの分野で広く活用されている。                           │
│                                                             │
│  ## 関連概念                                                │
│                                                             │
│  [[ニューラルネットワーク]] | [[深層学習]] | [[データサイエンス]] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 技術設計

### プロンプト設計

```typescript
// lib/wikiGenerator.ts
const WIKI_GENERATOR_PROMPT = `
あなたは簡潔で正確な百科事典の執筆者です。
与えられたタイトルについて、以下の形式で解説を生成してください。

## 出力要件
1. 200〜500字程度の簡潔な解説
2. 関連するキーワードを [[キーワード]] の形式でリンクとして含める
3. リンクは3〜7個程度
4. 見出し（##）を使って構造化する
5. 客観的で百科事典風のトーンで書く
6. タイトルと同じ言語で書く

## 出力形式
タイトルの太字表示から始め、定義を述べてから詳細を展開する。

## タイトル
{{title}}
`;
```

### API 呼び出し

```typescript
// lib/wikiGenerator.ts
import { loadAISettings, createAIClient } from "./aiClient";

export interface WikiGeneratorResult {
  content: string;
  wikiLinks: string[];
}

export async function generateWikiContent(
  title: string
): Promise<WikiGeneratorResult> {
  const settings = loadAISettings();
  if (!settings) {
    throw new Error("AI設定が必要です");
  }

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);
  const client = createAIClient(settings);

  let content: string;

  switch (settings.provider) {
    case "openai": {
      const response = await client.chat.completions.create({
        model: settings.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      });
      content = response.choices[0].message.content || "";
      break;
    }
    case "anthropic": {
      const response = await client.messages.create({
        model: settings.model,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      content =
        response.content[0].type === "text" ? response.content[0].text : "";
      break;
    }
    case "google": {
      const model = client.getGenerativeModel({ model: settings.model });
      const response = await model.generateContent(prompt);
      content = response.response.text();
      break;
    }
  }

  // WikiLink を抽出
  const wikiLinks = extractWikiLinks(content);

  return { content, wikiLinks };
}

function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)]; // 重複除去
}
```

### Tiptap への挿入

```typescript
// hooks/useWikiGenerator.ts
import { useMutation } from "@tanstack/react-query";
import { generateWikiContent } from "@/lib/wikiGenerator";
import { Editor } from "@tiptap/react";

export function useWikiGenerator(editor: Editor | null) {
  return useMutation({
    mutationFn: async (title: string) => {
      return generateWikiContent(title);
    },
    onSuccess: (result) => {
      if (editor) {
        // Markdown を Tiptap JSON に変換して挿入
        // 既存のコンテンツを置き換える
        editor.commands.setContent(markdownToTiptap(result.content));
      }
    },
  });
}
```

---

## ファイル構成

```
src/
├── lib/
│   ├── wikiGenerator.ts          # Wiki生成ロジック（新規）
│   └── markdownToTiptap.ts       # Markdown→Tiptap変換（新規）
├── hooks/
│   └── useWikiGenerator.ts       # Wiki生成フック（新規）
└── components/
    └── editor/
        └── WikiGeneratorButton.tsx # Wiki生成ボタン（新規）
```

---

## 実装ステップ

| Step | 内容                                       | 見積もり |
| :--- | :----------------------------------------- | :------- |
| 1    | プロンプト設計と調整                       | 1 時間   |
| 2    | API 呼び出しロジック（各プロバイダー対応） | 2 時間   |
| 3    | WikiLink 抽出機能                          | 30 分    |
| 4    | Markdown → Tiptap 変換                     | 1.5 時間 |
| 5    | Wiki 生成ボタンコンポーネント              | 1 時間   |
| 6    | エディタへの統合                           | 1 時間   |
| 7    | ローディング・エラー表示                   | 30 分    |
| 8    | テストと調整                               | 1.5 時間 |

**合計見積もり: 約 9 時間**

---

## エラーハンドリング

| エラー             | 表示メッセージ                                                         |
| :----------------- | :--------------------------------------------------------------------- |
| AI 設定なし        | 「AI 設定が必要です。設定画面で API キーを入力してください。」         |
| API キー無効       | 「API キーが無効です。設定を確認してください。」                       |
| レート制限         | 「リクエスト制限に達しました。しばらく待ってから再試行してください。」 |
| ネットワークエラー | 「ネットワークエラーが発生しました。接続を確認してください。」         |
| 生成タイムアウト   | 「生成に時間がかかっています。再試行してください。」                   |

---

## 将来の拡張

1. **カスタムプロンプト**: ユーザーがプロンプトをカスタマイズ可能に
2. **生成履歴**: 過去の生成結果を参照可能に
3. **部分生成**: 選択テキストに対してのみ Wiki 生成
4. **言語検出**: タイトルの言語を自動検出して出力言語を調整

---

## 関連ドキュメント

- [LLM API 設定画面](./llm-api-settings.md)
- [PRD: AI Node Scaffolding](../PRD.md#ai-node-scaffolding-wiki-generator)
