// Wiki Generator - Wikipedia風コンテンツ生成機能（ストリーミング対応）

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings } from "@/types/ai";
import { loadAISettings } from "./aiSettings";

// プロンプトテンプレート
const WIKI_GENERATOR_PROMPT = `あなたはWikipediaのような百科事典記事を執筆する専門家です。
与えられたタイトル（キーワード）について、**初心者から中級者**が理解できる、包括的で教育的な解説記事を生成してください。

## あなたの役割
- 読者が「このトピックについて体系的に理解したい」と思ったときに参照できる、信頼性の高い解説記事を作成する
- 表面的な説明ではなく、**なぜそうなのか**、**どのように機能するのか**を丁寧に解説する
- 専門用語は必ず初出時に説明を加え、読者が置いてけぼりにならないようにする

## 記事構成ガイドライン

### 1. 導入部（リード文）- 3〜4文で構成
- **タイトル**（太字）から始め、以下を含める：
  - 明確な定義（何であるか）
  - 重要性・意義（なぜ知っておくべきか）
  - 文脈・位置づけ（どの分野・領域に属するか）
- 読者がこの記事を読む価値を感じられるように書く
- 専門用語には「〜とは、...のこと」のような補足を加える

### 2. 本文セクション（詳細な解説）
タイトルの性質に応じて、以下のセクションから適切なものを選んで構成する。
**各セクションは2〜3段落で詳しく説明すること。**

**概念・用語の場合：**
- **概要**: 定義を掘り下げ、類似概念との違いを明確にする
- **歴史・背景**: いつ、誰が、なぜ生まれたのか。発展の経緯を時系列で説明
- **仕組み・原理**: どのように機能するのか。初心者にもわかるよう段階的に説明
- **特徴・性質**: 他と何が違うのか。メリット・デメリットを含める
- **種類・分類**: 主要なバリエーションや派生を紹介
- **具体例・活用例**: 実際にどう使われているか。身近な例を挙げる
- **現状と将来**: 最新の動向、今後の展望

**人物の場合：**
- **概要**: 一言で表す肩書きと主な功績
- **生涯・経歴**: 生い立ちから現在まで。転機となった出来事を中心に
- **主要な業績**: 具体的な成果物、発見、作品などを詳しく解説
- **思想・哲学**: その人物の考え方、価値観
- **影響・評価**: 社会・業界への影響、後世への影響

**技術・製品の場合：**
- **概要**: 何を解決するためのものか、どんな問題を解決するか
- **仕組み・アーキテクチャ**: 技術的な原理を初心者にもわかるよう説明
- **歴史・発展**: 誕生から現在までの進化。バージョンの変遷など
- **特徴・利点**: 競合との比較、選ばれる理由
- **実践的な使い方**: 基本的な使用方法、ベストプラクティス
- **エコシステム**: 関連ツール、ライブラリ、コミュニティ

**出来事・現象の場合：**
- **概要**: 何が起きたのか、規模感を含めて
- **背景・原因**: なぜ起きたのか。複数の要因がある場合は整理して説明
- **経緯・展開**: 時系列で何が起きたか
- **影響・結果**: 短期的・長期的な影響。数値データがあれば含める
- **教訓・考察**: この出来事から学べること

### 3. 関連項目
- 記事末尾に「## 関連項目」セクションを設け、関連するキーワードを箇条書きでリストアップ
- 各項目には1行の簡潔な説明を加える（例：「- [[React]] - 同じくUIライブラリとして広く使われる」）

### 4. 出典・参照元（インラインリンク形式）
**最重要**: 記事の信頼性を担保するため、事実・データには必ず出典を明記すること。

**インラインリンクの記載形式：**
- 文末に括弧でリンクを追加: 〜である（[出典名](URL)）
- または文中に自然に組み込む: [公式ドキュメント](URL)によると〜

**出典の挿入ルール：**
- **必須**: 年号、数値、統計、引用、重要な事実には必ず出典を付ける
- **頻度**: 各セクションに2〜3個程度の出典を目安とする
- **優先順位**: 公式サイト > Wikipedia > 学術機関 > 権威あるメディア
- **形式**: \`[表示テキスト](URL)\` 形式のMarkdownリンクを使用
- **注意**: 脚注形式（[^1]など）は使用しないこと

## 出力要件

1. **分量**: 2000〜3000字程度の詳細な解説
   - 導入部: 200〜300字
   - 各セクション: 300〜500字
   - 関連項目: 100〜200字

2. **WikiLink**: 本文中の重要なキーワードを [[キーワード]] 形式でリンク化（10〜20個程度）
   - 初出時のみリンク化する
   - 固有名詞、専門用語、関連概念を優先的にリンク化
   - 一般的すぎる単語（例：「情報」「技術」）は避ける

3. **見出し**: ## で主要セクション、### で細分化（必要に応じて）

4. **トーン**: 
   - 客観的・中立的・百科事典的な文体
   - ただし、堅すぎず親しみやすい表現も適宜使用
   - 「〜しましょう」「〜ですね」などの語りかけは避ける

5. **言語**: タイトルと同じ言語で執筆

6. **わかりやすさの工夫**:
   - 専門用語は初出時に説明を加える
   - 抽象的な概念には具体例を添える
   - 複雑な仕組みは段階的に説明する
   - 比喩や例えを効果的に使用する

7. **正確性**: 
   - 事実に基づいた正確な情報を提供
   - 不確かな場合は「〜とされる」「〜と考えられている」などの表現を使用
   - 最新情報を優先し、古い情報には注意書きを加える

## 出力形式
Markdown形式で出力。コードブロックで囲まないこと。
参考文献セクションは不要。出典は本文中にインラインリンクとして含める。

## タイトル
{{title}}`;

export interface WikiGeneratorResult {
  content: string;
  wikiLinks: string[];
}

export interface WikiGeneratorCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (result: WikiGeneratorResult) => void;
  onError: (error: Error) => void;
}

/**
 * AI設定を取得し、設定されているか確認
 */
export async function getAISettingsOrThrow(): Promise<AISettings> {
  const settings = await loadAISettings();
  if (!settings || !settings.isConfigured || !settings.apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return settings;
}

/**
 * WikiLinkを抽出する
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)]; // 重複除去
}

/**
 * OpenAIでストリーミング生成（Web検索対応）
 */
async function generateWithOpenAI(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);

  // Web検索対応モデルかどうかを判定
  const isSearchModel = settings.model.includes("search");

  // Web検索対応モデルの場合、web_search_optionsを追加
  const webSearchOptions = isSearchModel
    ? { search_context_size: "medium" as const }
    : undefined;

  const stream = await client.chat.completions.create(
    {
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000, // 2000-3000字に対応するため増加
      temperature: 0.7,
      stream: true,
      web_search_options: webSearchOptions,
    },
    { signal: abortSignal }
  );

  let fullContent = "";

  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  const wikiLinks = extractWikiLinks(fullContent);
  callbacks.onComplete({ content: fullContent, wikiLinks });
}

/**
 * Web検索をサポートするClaudeモデルかどうかを判定
 */
function isClaudeWebSearchSupported(model: string): boolean {
  // Web検索をサポートするモデル（2025年5月以降のモデル）
  const supportedPatterns = [
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-sonnet-3.7",
    "claude-sonnet-3-5-sonnet",
    "claude-3-5-sonnet",
    "claude-haiku-3.5",
    "claude-3-5-haiku",
  ];
  return supportedPatterns.some((pattern) =>
    model.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Anthropicでストリーミング生成（Web検索対応）
 */
async function generateWithAnthropic(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);

  // Web検索ツールの設定（対応モデルの場合のみ）
  const useWebSearch = isClaudeWebSearchSupported(settings.model);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParams: any = {
    model: settings.model,
    max_tokens: 4000, // 2000-3000字に対応するため増加
    messages: [{ role: "user", content: prompt }],
  };

  // Web検索対応モデルの場合、Web検索ツールを追加
  if (useWebSearch) {
    requestParams.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5, // 最大5回の検索
      },
    ];
  }

  const stream = client.messages.stream(requestParams, { signal: abortSignal });

  let fullContent = "";

  for await (const event of stream) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const content = event.delta.text;
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  const wikiLinks = extractWikiLinks(fullContent);
  callbacks.onComplete({ content: fullContent, wikiLinks });
}

/**
 * Google AIでストリーミング生成（Google Search Grounding対応）
 * 公式ドキュメント: https://ai.google.dev/gemini-api/docs/google-search?hl=ja
 */
async function generateWithGoogle(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  // 新しい @google/genai SDK を使用
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  // Google Search ツール（Gemini 2.0以降で推奨）
  // 参考: https://ai.google.dev/gemini-api/docs/google-search?hl=ja
  const googleSearchTool = {
    googleSearch: {},
  };

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);

  // ストリーミング生成
  const response = await client.models.generateContentStream({
    model: settings.model,
    contents: prompt,
    config: {
      tools: [googleSearchTool],
      maxOutputTokens: 4000, // 2000-3000字に対応するため増加
      temperature: 0.7,
    },
  });

  let fullContent = "";

  for await (const chunk of response) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    const content = chunk.text;
    if (content) {
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  const wikiLinks = extractWikiLinks(fullContent);
  callbacks.onComplete({ content: fullContent, wikiLinks });
}

/**
 * Wikiコンテンツをストリーミング生成
 */
export async function generateWikiContentStream(
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  try {
    const settings = await getAISettingsOrThrow();

    switch (settings.provider) {
      case "openai":
        await generateWithOpenAI(settings, title, callbacks, abortSignal);
        break;
      case "anthropic":
        await generateWithAnthropic(settings, title, callbacks, abortSignal);
        break;
      case "google":
        await generateWithGoogle(settings, title, callbacks, abortSignal);
        break;
      default:
        throw new Error(`Unknown provider: ${settings.provider}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error("Unknown error occurred"));
    }
  }
}

/**
 * MarkdownをTiptap JSON形式に変換するためのヘルパー
 * WikiLinkを適切なマークに変換
 */
export function convertMarkdownToTiptapContent(markdown: string): string {
  // TiptapのsetContent()はHTMLまたはJSONを受け付ける
  // ここではシンプルにMarkdownテキストをTiptapの段落構造に変換

  const lines = markdown.split("\n");
  const doc: {
    type: string;
    content: Array<{
      type: string;
      attrs?: Record<string, unknown>;
      content?: Array<{
        type: string;
        text?: string;
        marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
      }>;
    }>;
  } = {
    type: "doc",
    content: [],
  };

  for (const line of lines) {
    if (line.trim() === "") {
      // 空行
      doc.content.push({ type: "paragraph" });
    } else if (line.startsWith("### ")) {
      // H3
      doc.content.push({
        type: "heading",
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(4)),
      });
    } else if (line.startsWith("## ")) {
      // H2
      doc.content.push({
        type: "heading",
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(3)),
      });
    } else if (line.startsWith("# ")) {
      // H1
      doc.content.push({
        type: "heading",
        attrs: { level: 1 },
        content: parseInlineContent(line.slice(2)),
      });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // リストアイテム（簡易実装）
      const existingList = doc.content[doc.content.length - 1];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(line.slice(2)),
          },
        ],
      };

      if (existingList && existingList.type === "bulletList") {
        (existingList.content as Array<typeof listItem>).push(listItem);
      } else {
        doc.content.push({
          type: "bulletList",
          content: [listItem] as typeof doc.content,
        });
      }
    } else {
      // 通常の段落
      doc.content.push({
        type: "paragraph",
        content: parseInlineContent(line),
      });
    }
  }

  return JSON.stringify(doc);
}

/**
 * インラインコンテンツをパース（WikiLink、外部リンク、太字、斜体など）
 */
function parseInlineContent(text: string): Array<{
  type: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}> {
  const content: Array<{
    type: string;
    text?: string;
    marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  }> = [];

  // 全てのマッチを収集
  interface MatchInfo {
    index: number;
    length: number;
    text: string;
    type: string;
    url?: string;
  }

  const matches: MatchInfo[] = [];

  let match;

  // WikiLink
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  while ((match = wikiLinkRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "wikiLink",
    });
  }

  // 外部リンク [テキスト](URL) - WikiLinkと区別するため、[[を含まないものだけ
  const externalLinkRegex = /(?<!\[)\[([^[\]]+)\]\(([^)]+)\)/g;
  while ((match = externalLinkRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      url: match[2],
      type: "link",
    });
  }

  // 太字
  const boldRegex = /\*\*([^*]+)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "bold",
    });
  }

  // 斜体（太字とは別に）
  const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      type: "italic",
    });
  }

  // インデックスでソート
  matches.sort((a, b) => a.index - b.index);

  // テキストを分割して処理
  let lastIndex = 0;
  for (const m of matches) {
    // 重複するマッチをスキップ
    if (m.index < lastIndex) continue;

    // マッチ前のプレーンテキスト
    if (m.index > lastIndex) {
      content.push({
        type: "text",
        text: text.slice(lastIndex, m.index),
      });
    }

    // マッチしたコンテンツ
    if (m.type === "wikiLink") {
      content.push({
        type: "text",
        text: `[[${m.text}]]`,
        marks: [
          {
            type: "wikiLink",
            attrs: {
              title: m.text,
              exists: false, // 新規生成なので存在しないとする
            },
          },
        ],
      });
    } else if (m.type === "link") {
      // 外部リンク
      content.push({
        type: "text",
        text: m.text,
        marks: [
          {
            type: "link",
            attrs: {
              href: m.url,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          },
        ],
      });
    } else if (m.type === "bold") {
      content.push({
        type: "text",
        text: m.text,
        marks: [{ type: "bold" }],
      });
    } else if (m.type === "italic") {
      content.push({
        type: "text",
        text: m.text,
        marks: [{ type: "italic" }],
      });
    }

    lastIndex = m.index + m.length;
  }

  // 残りのテキスト
  if (lastIndex < text.length) {
    content.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  // コンテンツがない場合は空のテキストを返す
  if (content.length === 0 && text.length > 0) {
    content.push({
      type: "text",
      text: text,
    });
  }

  return content;
}
