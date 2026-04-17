/**
 * YouTube URL → Tiptap JSON + AI 要約パイプライン。
 * YouTube URL → Tiptap JSON document with AI summary pipeline.
 *
 * articleExtractor.ts と同じ ExtractedArticle 形式を返すため、
 * clipAndCreate.ts や ingest.ts からシームレスに利用できる。
 *
 * Returns the same ExtractedArticle shape as articleExtractor.ts so it
 * integrates seamlessly with clipAndCreate.ts and ingest.ts.
 */
import { createHash } from "node:crypto";
import {
  fetchYouTubeContent,
  formatDuration,
  type YouTubeContent,
} from "../services/youtubeService.js";
import { callProvider } from "../services/aiProviders.js";
import type { TiptapNode } from "./articleExtractor.js";
import type { AIProviderType, AIMessage, TokenUsage } from "../types/index.js";

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * YouTube 抽出の入力。
 * Input for YouTube content extraction.
 */
export interface ExtractYouTubeInput {
  /** YouTube 動画 ID / YouTube video ID */
  videoId: string;
  /** YouTube Data API キー（任意） / YouTube Data API key (optional) */
  youtubeApiKey?: string;
  /** AI プロバイダー（要約生成用、任意） / AI provider for summary (optional) */
  aiProvider?: AIProviderType;
  /** AI モデル ID / AI model ID */
  aiModel?: string;
  /** AI プロバイダーの API キー / AI provider API key */
  aiApiKey?: string;
  /** コンテンツプレビューの最大長 / Max content preview length */
  previewLength?: number;
}

/**
 * 抽出結果（articleExtractor.ts の ExtractedArticle と互換）。
 * Extraction result (compatible with articleExtractor.ts ExtractedArticle).
 */
export interface ExtractedYouTube {
  finalUrl: string;
  title: string;
  thumbnailUrl: string | null;
  tiptapJson: TiptapNode;
  contentText: string;
  contentHash: string;
  /**
   * AI 要約が実際に実行された場合のトークン使用量。
   * 呼ばれなかった、または失敗した場合は null。
   *
   * Token usage when AI summary was actually executed successfully.
   * null when AI call was skipped (missing params / content too short) or failed.
   */
  aiUsage: TokenUsage | null;
}

// ── Summary Prompt ────────────────────────────────────────────────────────

/**
 * 字幕テキストの最大長（AI 要約用、超過時は先頭を切り詰める）。
 * Max transcript length for AI summarization (truncated from start if exceeded).
 */
const MAX_TRANSCRIPT_FOR_SUMMARY = 30_000;

/**
 * AI 要約用のプロンプトを構築する。
 * Builds prompt messages for AI summarization.
 *
 * @param content - 要約対象テキスト（字幕 or description） / Text to summarize
 * @param title - 動画タイトル / Video title
 * @param isTranscript - 字幕テキストかどうか / Whether the content is a transcript
 * @returns AI メッセージ配列 / AI messages array
 */
function buildSummaryPrompt(content: string, title: string, isTranscript: boolean): AIMessage[] {
  const truncated =
    content.length > MAX_TRANSCRIPT_FOR_SUMMARY
      ? content.slice(0, MAX_TRANSCRIPT_FOR_SUMMARY) + "\n\n[... truncated ...]"
      : content;

  const sourceLabel = isTranscript ? "字幕テキスト (transcript)" : "動画説明文 (description)";

  return [
    {
      role: "system" as const,
      content: `あなたは YouTube 動画の内容を簡潔かつ分かりやすく要約するアシスタントです。
以下のルールに従って要約を生成してください：

1. 動画の主要なポイントを箇条書きで整理する
2. 技術的な内容の場合、キーとなる概念や用語を説明する
3. 日本語で要約する（元が英語の場合も日本語で）
4. 要約は 500〜1500 文字程度に収める
5. Markdown 形式（見出し・箇条書き）を使用する

You are an assistant that summarizes YouTube video content clearly and concisely.
Follow the rules above to generate a summary in Japanese.`,
    },
    {
      role: "user" as const,
      content: `以下の YouTube 動画「${title}」の${sourceLabel}を要約してください。

---
${truncated}
---`,
    },
  ];
}

// ── Tiptap JSON Builder ───────────────────────────────────────────────────

/**
 * テキストを Tiptap paragraph ノードに変換する。
 * Converts text to a Tiptap paragraph node.
 */
function textParagraph(text: string): TiptapNode {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

/**
 * 見出しノードを作成する。
 * Creates a heading node.
 */
function heading(level: number, text: string): TiptapNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

/**
 * 要約テキスト（Markdown）を簡易的に Tiptap ノード配列に変換する。
 * Converts summary text (simple Markdown) to Tiptap node array.
 *
 * 完全な Markdown パーサーではなく、AI 要約で頻出するパターンのみ対応:
 * - ## 見出し → heading(3)
 * - - 箇条書き → bulletList
 * - 通常テキスト → paragraph
 */
function summaryToTiptapNodes(markdown: string): TiptapNode[] {
  const lines = markdown.split("\n");
  const nodes: TiptapNode[] = [];
  let currentListItems: TiptapNode[] = [];

  function flushList() {
    if (currentListItems.length > 0) {
      nodes.push({
        type: "bulletList",
        content: currentListItems,
      });
      currentListItems = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    // 見出し: ## or ### / Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      // 要約内の見出しは h3 に統一（h2 は動画情報セクションで使用）
      // Normalize summary headings to h3 (h2 is used for section headers)
      nodes.push(heading(3, headingMatch[2] ?? ""));
      continue;
    }

    // 箇条書き: - or * / Bullet list items
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      currentListItems.push({
        type: "listItem",
        content: [textParagraph(listMatch[1] ?? "")],
      });
      continue;
    }

    // 番号付きリスト: 1. / Numbered list items (treated as bullet)
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      currentListItems.push({
        type: "listItem",
        content: [textParagraph(numberedMatch[1] ?? "")],
      });
      continue;
    }

    // 通常テキスト / Regular paragraph
    flushList();
    nodes.push(textParagraph(trimmed));
  }

  flushList();
  return nodes;
}

/**
 * YouTube コンテンツから Tiptap JSON ドキュメントを構築する。
 * Builds a Tiptap JSON document from YouTube content.
 *
 * 構造:
 * - youtubeEmbed (動画埋め込み)
 * - heading(2): 動画情報
 * - paragraph: メタデータ
 * - heading(2): 要約
 * - (AI 要約のノード群)
 * - heading(2): 字幕テキスト (字幕がある場合のみ)
 * - paragraph: 字幕全文
 */
function buildYouTubeTiptapDoc(
  videoId: string,
  ytContent: YouTubeContent,
  summary: string | null,
): TiptapNode {
  const { metadata } = ytContent;
  const content: TiptapNode[] = [];

  // 1. YouTube 埋め込み / YouTube embed
  content.push({
    type: "youtubeEmbed",
    attrs: { videoId },
  });

  // 2. 動画情報セクション / Video info section
  content.push(heading(2, "動画情報 / Video Info"));

  const infoParts: string[] = [];
  if (metadata.channelTitle) infoParts.push(`チャンネル: ${metadata.channelTitle}`);
  if (metadata.publishedAt) {
    const date = new Date(metadata.publishedAt);
    infoParts.push(`公開日: ${date.toLocaleDateString("ja-JP")}`);
  }
  if (metadata.duration) {
    infoParts.push(`再生時間: ${formatDuration(metadata.duration)}`);
  }
  if (infoParts.length > 0) {
    content.push(textParagraph(infoParts.join(" | ")));
  }

  if (metadata.description) {
    // description の先頭 500 文字のみ表示 / Show first 500 chars of description
    const desc =
      metadata.description.length > 500
        ? metadata.description.slice(0, 500) + "..."
        : metadata.description;
    content.push(textParagraph(desc));
  }

  // 3. 要約セクション / Summary section
  if (summary) {
    content.push(heading(2, "要約 / Summary"));
    const summaryNodes = summaryToTiptapNodes(summary);
    content.push(...summaryNodes);
  }

  // 4. 字幕テキストセクション（字幕がある場合のみ） / Transcript section
  if (ytContent.transcriptText) {
    content.push(heading(2, "字幕テキスト / Transcript"));
    // 長い字幕は適度なチャンクに分割して paragraph にする
    // Split long transcripts into reasonable paragraph chunks
    const maxChunkLen = 2000;
    const fullText = ytContent.transcriptText;
    for (let i = 0; i < fullText.length; i += maxChunkLen) {
      content.push(textParagraph(fullText.slice(i, i + maxChunkLen)));
    }
  }

  return {
    type: "doc",
    content,
  };
}

// ── Main Extractor ────────────────────────────────────────────────────────

/**
 * YouTube 動画 ID から Tiptap JSON ドキュメント（埋め込み + メタデータ + AI 要約）を生成する。
 * Generates a Tiptap JSON document with video embed, metadata, and AI summary.
 *
 * @param input - 抽出入力 / Extraction input
 * @returns articleExtractor.ts の ExtractedArticle 互換の結果 / ExtractedArticle-compatible result
 */
export async function extractYouTubeContent(input: ExtractYouTubeInput): Promise<ExtractedYouTube> {
  const { videoId, youtubeApiKey, aiProvider, aiModel, aiApiKey, previewLength = 200 } = input;

  // 1. メタデータ + 字幕を取得 / Fetch metadata + transcript
  const ytContent = await fetchYouTubeContent(videoId, youtubeApiKey);

  // 2. AI 要約を生成 / Generate AI summary
  // aiUsage は実際に AI が呼ばれて成功した場合のみ設定される（課金判定に使用）
  // aiUsage is only set when AI was actually called successfully (used for billing)
  let summary: string | null = null;
  let aiUsage: TokenUsage | null = null;
  if (aiProvider && aiModel && aiApiKey) {
    const textForSummary = ytContent.transcriptText || ytContent.metadata.description;
    if (textForSummary && textForSummary.length > 50) {
      try {
        const isTranscript = Boolean(ytContent.transcriptText);
        const messages = buildSummaryPrompt(textForSummary, ytContent.metadata.title, isTranscript);
        const result = await callProvider(aiProvider, aiApiKey, aiModel, messages, {
          temperature: 0.3,
          maxTokens: 2048,
        });
        summary = result.content;
        aiUsage = result.usage;
      } catch (err) {
        console.error("YouTube AI summary failed:", err);
        // 要約失敗はエラーにせず、要約なしで続行
        // aiUsage は null のまま（課金しない）
        // Summary failure is non-fatal; continue without summary
        // aiUsage stays null (don't bill for failed call)
      }
    }
  }

  // 3. Tiptap JSON を構築 / Build Tiptap JSON
  const tiptapJson = buildYouTubeTiptapDoc(videoId, ytContent, summary);

  // 4. プレビューテキスト / Preview text
  const previewParts: string[] = [];
  if (summary) previewParts.push(summary);
  else if (ytContent.metadata.description) previewParts.push(ytContent.metadata.description);
  else if (ytContent.transcriptText) previewParts.push(ytContent.transcriptText);
  const contentText = previewParts.join(" ").slice(0, previewLength);

  // 5. コンテンツハッシュ / Content hash
  const hashSource = ytContent.transcriptText || ytContent.metadata.description || videoId;
  const contentHash = createHash("sha256").update(hashSource).digest("hex");

  return {
    finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: ytContent.metadata.title,
    thumbnailUrl: ytContent.metadata.thumbnailUrl,
    tiptapJson,
    contentText,
    contentHash,
    aiUsage,
  };
}
