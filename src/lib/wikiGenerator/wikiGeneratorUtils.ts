/**
 * Wiki Generator 用ユーティリティ・型定義
 */

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
 * WikiLinkを抽出する
 */
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)]; // 重複除去
}
