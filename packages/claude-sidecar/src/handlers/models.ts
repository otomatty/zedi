/**
 * Lists available Claude models via the SDK Query control API.
 * SDK の Query コントロール API 経由で利用可能な Claude モデル一覧を取得する。
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

/**
 *
 */
export interface ClaudeModelInfo {
  value: string;
  displayName: string;
  description: string;
}

/**
 * Creates a minimal SDK query to retrieve the available model list via `initializationResult()`.
 * 最小限の SDK クエリを作成し、`initializationResult()` でモデル一覧を取得する。
 */
export async function listClaudeModels(): Promise<ClaudeModelInfo[]> {
  const q = query({
    prompt: "",
    options: {
      maxTurns: 0,
      permissionMode: "plan",
    },
  });
  try {
    const initResult = await q.initializationResult();
    return initResult.models.map((m) => ({
      value: m.value,
      displayName: m.displayName,
      description: m.description,
    }));
  } finally {
    q.close();
  }
}
