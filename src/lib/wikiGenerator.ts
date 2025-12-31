// Wiki Generator - Wikipedia風コンテンツ生成機能（ストリーミング対応）

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AISettings } from "@/types/ai";
import { loadAISettings } from "./aiSettings";

// プロンプトテンプレート
const WIKI_GENERATOR_PROMPT = `あなたはWikipediaのような百科事典記事を執筆する専門家です。
与えられたタイトル（キーワード）について、包括的で教育的な解説記事を生成してください。
**重要**: すべての情報には根拠となる参照元をインラインリンクで明記してください。

## 記事構成ガイドライン

### 1. 導入部（リード文）
- **タイトル**（太字）から始め、簡潔な定義を1〜2文で述べる
- 何であるか、なぜ重要か、どの分野に属するかを明確にする
- 専門用語には補足説明を加える

### 2. 本文セクション（以下から適切なものを選択）
タイトルの性質に応じて、以下のセクションから適切なものを選んで構成する：

**概念・用語の場合：**
- 概要 / 定義
- 歴史・背景
- 特徴・性質
- 種類・分類
- 用途・応用
- 関連概念

**人物の場合：**
- 概要
- 生涯・経歴
- 業績・功績
- 影響・評価

**技術・製品の場合：**
- 概要
- 仕組み・原理
- 歴史・発展
- 特徴・利点
- 用途・活用例

**出来事・現象の場合：**
- 概要
- 背景・原因
- 経緯・展開
- 影響・結果

### 3. 関連項目
- 記事末尾に「## 関連項目」セクションを設け、関連するキーワードをリストアップ

### 4. 出典・参照元（インラインリンク形式）
**重要**: 脚注形式（[^1]など）は使用しないこと。代わりに、本文中で情報の根拠を示す際は、その場でインラインリンクを挿入する。

**インラインリンクの記載形式：**
- 文末に括弧でリンクを追加: 〜である（[出典名](URL)）
- または文中に自然に組み込む: [公式ドキュメント](URL)によると〜

**具体例：**
- 「Reactは2013年にオープンソース化された（[React公式ブログ](https://react.dev/blog)）。」
- 「[[仮想DOM]]を採用することで効率的な更新が可能になる（[MDN Web Docs](https://developer.mozilla.org/)）。」
- 「[Wikipedia](https://ja.wikipedia.org/wiki/React)によると、Reactは〜」

**出典の挿入ルール：**
- 重要な事実・数値・年号には必ず出典リンクを付ける
- 1つの段落に1〜2個程度の出典を目安とする
- 実在する信頼性の高いソースを優先する（公式サイト、Wikipedia、学術機関、権威あるメディア）
- URLは必ず \`[表示テキスト](URL)\` 形式のMarkdownリンクで記載

## 出力要件
1. **分量**: 800〜1500字程度の詳細な解説
2. **WikiLink**: 本文中の重要なキーワードを [[キーワード]] 形式でリンク化（5〜15個程度）
   - 初出時のみリンク化する
   - 固有名詞、専門用語、関連概念を優先的にリンク化
3. **見出し**: ## で主要セクション、### で細分化
4. **トーン**: 客観的・中立的・百科事典的な文体
5. **言語**: タイトルと同じ言語で執筆
6. **正確性**: 事実に基づいた正確な情報を提供（不確かな場合は「〜とされる」「〜と考えられている」などの表現を使用）
7. **出典**: 重要な事実にはインラインリンクで出典を明記する（脚注形式は使わない）

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
 * OpenAIでストリーミング生成
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

  const stream = await client.chat.completions.create(
    {
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
      stream: true,
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
 * Anthropicでストリーミング生成
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

  const stream = client.messages.stream(
    {
      model: settings.model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    },
    { signal: abortSignal }
  );

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
 * Google AIでストリーミング生成
 */
async function generateWithGoogle(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new GoogleGenerativeAI(settings.apiKey);
  const model = client.getGenerativeModel({ model: settings.model });

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);

  const result = await model.generateContentStream(prompt);

  let fullContent = "";

  for await (const chunk of result.stream) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    const content = chunk.text();
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
