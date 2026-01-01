import type { Page } from "@/types/page";
import { extractPlainText } from "./contentUtils";

/**
 * マッチタイプの定義
 */
export type MatchType = "exact_title" | "title" | "content" | "both";

/**
 * 正規表現の特殊文字をエスケープ
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 文単位でスマートスニペットを抽出
 */
export function extractSmartSnippet(
  text: string,
  keywords: string[],
  maxLength: number = 120
): string {
  if (!text || keywords.length === 0) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  // 文で分割（句点、ピリオド、感嘆符、疑問符、改行）
  const sentences = text.split(/[。.!?！？\n]+/).filter((s) => s.trim());

  if (sentences.length === 0) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }

  // キーワードを最も多く含む文を探す
  let bestSentence = "";
  let bestScore = 0;

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    const score = keywords.reduce((acc, keyword) => {
      return acc + (lowerSentence.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence.trim();
    }
  }

  // マッチする文がない場合は最初の文を使用
  if (!bestSentence) {
    bestSentence = sentences[0].trim();
  }

  // 文が長すぎる場合は最初のキーワード周辺を抽出
  if (bestSentence.length > maxLength) {
    const firstKeyword = keywords[0].toLowerCase();
    const index = bestSentence.toLowerCase().indexOf(firstKeyword);

    if (index !== -1) {
      const start = Math.max(0, index - 40);
      const end = Math.min(
        bestSentence.length,
        index + firstKeyword.length + 60
      );
      let snippet = bestSentence.slice(start, end);

      if (start > 0) snippet = "..." + snippet;
      if (end < bestSentence.length) snippet = snippet + "...";

      return snippet;
    }
  }

  // 文が短い場合はそのまま返す
  if (bestSentence.length <= maxLength) {
    return bestSentence;
  }

  return bestSentence.slice(0, maxLength) + "...";
}

/**
 * キーワードをハイライト（【keyword】形式）
 */
export function highlightKeywords(text: string, keywords: string[]): string {
  let result = text;

  for (const keyword of keywords) {
    // 大文字小文字を保持しながら置換
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
    result = result.replace(regex, "【$1】");
  }

  return result;
}

/**
 * マッチタイプを判定
 */
export function determineMatchType(
  title: string,
  content: string,
  keywords: string[],
  originalQuery: string
): MatchType {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  const queryLower = originalQuery.toLowerCase().trim();

  // 完全一致の判定
  const isExactTitle = titleLower === queryLower;
  if (isExactTitle) {
    return "exact_title";
  }

  // 各キーワードのマッチを確認
  const titleMatchAll = keywords.every((k) =>
    titleLower.includes(k.toLowerCase())
  );
  const contentMatchAll = keywords.every((k) =>
    contentLower.includes(k.toLowerCase())
  );

  if (titleMatchAll && contentMatchAll) {
    return "both";
  } else if (titleMatchAll) {
    return "title";
  } else {
    return "content";
  }
}

/**
 * 強化版スコアリング
 */
export function calculateEnhancedScore(
  page: Page,
  keywords: string[],
  matchType: MatchType
): number {
  let score = 0;

  // マッチタイプによる基本スコア
  switch (matchType) {
    case "exact_title":
      score += 200;
      break;
    case "title":
      score += 100;
      break;
    case "both":
      score += 80;
      break;
    case "content":
      score += 30;
      break;
  }

  // タイトルの先頭一致ボーナス
  const titleLower = page.title.toLowerCase();
  if (keywords.length > 0 && titleLower.startsWith(keywords[0].toLowerCase())) {
    score += 50;
  }

  // キーワード出現回数ボーナス（コンテンツ内）
  const content = extractPlainText(page.content).toLowerCase();
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    const regex = new RegExp(escapeRegExp(keywordLower), "g");
    const occurrences = (content.match(regex) || []).length;
    score += Math.min(occurrences, 5) * 2;
  }

  // 新しさボーナス（10日以内のページに加点）
  const ageInDays = (Date.now() - page.updatedAt) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 10 - Math.floor(ageInDays));

  return score;
}

/**
 * クエリを複数キーワードに分割
 */
export function parseSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((k) => k.length > 0);
}
