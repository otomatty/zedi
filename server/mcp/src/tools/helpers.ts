/**
 * MCP ツール共通ヘルパ
 *
 * - `wrapToolHandler` で ZediApiError をキャッチして MCP の `isError: true` 応答に変換する
 * - `textResult` / `jsonResult` で簡潔に CallToolResult を組み立てる
 *
 * Shared helpers for MCP tools — error wrapping and result formatting.
 */
import { ZediApiError } from "../client/errors.js";

/** MCP ツールが返す content アイテム / Single content item in a tool result. */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * MCP ツールが返す結果 / Tool call result shape consumed by the SDK.
 *
 * Index signature is required to match the SDK's structural CallToolResult type.
 * SDK の `CallToolResult` 型に合わせるためインデックスシグネチャを持つ。
 */
export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * ハンドラを呼び出し、`ZediApiError` を MCP のエラー応答 (`isError: true`) に変換する。
 * Wraps a tool handler so that ZediApiError is converted into an MCP error result.
 */
export async function wrapToolHandler<A>(
  handler: (args: A) => Promise<ToolResult>,
  args: A,
): Promise<ToolResult> {
  try {
    return await handler(args);
  } catch (err) {
    if (err instanceof ZediApiError) {
      const status = err.status === 0 ? "network" : `HTTP ${err.status}`;
      return {
        isError: true,
        content: [{ type: "text", text: `Zedi API error (${status}): ${err.message}` }],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: `Unexpected error: ${message}` }],
    };
  }
}

/** プレーンテキスト応答を作る / Build a plain text tool result. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** 任意の JSON シリアライズ可能な値を整形して返す / Build a JSON-formatted tool result. */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
