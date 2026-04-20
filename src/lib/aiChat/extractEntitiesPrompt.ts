/**
 * Prompt and parser for extracting wiki-worthy entities from a chat conversation.
 * 会話から Wiki に残す価値のあるエンティティを抽出するプロンプトとパーサー。
 */

/**
 * A single entity extracted from a conversation.
 * 会話から抽出された 1 エンティティ。
 */
export interface ExtractedEntity {
  /** Proposed page title. / 提案ページタイトル */
  title: string;
  /** One-line summary of what was discussed. / 議論内容の 1 行要約 */
  summary: string;
  /** True if no existing page covers this entity. / 既存ページがない場合 true */
  isNew: boolean;
}

/**
 * Builds the user prompt for entity extraction.
 * エンティティ抽出用ユーザープロンプトを組み立てる。
 *
 * @param conversationText - Serialized chat transcript. / シリアライズ済み会話ログ。
 * @param existingTitles - Known page titles for `isNew` determination. / 既存ページタイトル一覧。
 * @returns Prompt string for the LLM.
 */
export function buildExtractEntitiesPrompt(
  conversationText: string,
  existingTitles: string[],
): string {
  const titlesBlock =
    existingTitles.length > 0 ? existingTitles.map((t) => `- ${t}`).join("\n") : "(none)";

  return `あなたは知識整理のアシスタントです。以下のチャット会話から、Wiki ページとして残す価値のある**エンティティ**（概念・人物・技術・出来事など）を抽出してください。

## 会話ログ
<conversation>
${conversationText}
</conversation>

## 既存ページタイトル（isNew 判定に使用）
${titlesBlock}

## 出力形式
以下の JSON 配列のみを出力してください。マークダウンやコードフェンスは不要です。

[
  { "title": "エンティティ名", "summary": "1行の説明", "isNew": true },
  ...
]

## ルール
- 最大 5 件まで。重要度順で並べる。
- 一般的すぎるもの（「プログラミング」「AI」など）は避ける。
- 既存タイトルに完全一致するものは isNew: false にする。
- title は百科事典の見出しとして適切な短い名詞句にする。`;
}

/**
 * Parses the LLM response for entity extraction.
 * LLM レスポンスからエンティティ配列をパースする。
 *
 * @param raw - Raw LLM response string. / LLM の生レスポンス文字列。
 * @returns Parsed entity array. / パース済みエンティティ配列。
 * @throws Error if parsing fails.
 */
export function parseExtractedEntities(raw: string): ExtractedEntity[] {
  // Strip optional markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // Find the JSON array
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in LLM response");
  }

  const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];

  return arr
    .filter(
      (item): item is { title: string; summary: string; isNew: boolean } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).summary === "string",
    )
    .map((item) => ({
      title: item.title.trim(),
      summary: item.summary.trim(),
      isNew: item.isNew !== false,
    }))
    .slice(0, 5);
}
