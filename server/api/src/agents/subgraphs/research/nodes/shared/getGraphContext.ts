/**
 * Tiny helper that pulls the {@link GraphContext} out of LangGraph's
 * `RunnableConfig.configurable` bag.
 *
 * 各ノードが `config.configurable[GRAPH_CONTEXT_CONFIG_KEY]` を引く時の
 * boilerplate を 1 箇所に寄せるためのユーティリティ。`GraphRunner` が必ず
 * セットするので production 経路では undefined にならないが、ユニットテスト
 * で誤って忘れたケースを早期に検出するため throw する。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { normalizeComposeContentLocale } from "../../../../core/composeLocale.js";
import {
  GRAPH_CONTEXT_CONFIG_KEY,
  type GraphContext,
} from "../../../../core/types/graphContext.js";

/**
 * Returns the `GraphContext` injected by `GraphRunner.buildConfig`. Throws
 * when missing or malformed so misconfigured callers fail loudly with a
 * pointed error rather than running with default / undefined credentials and
 * exploding deep inside `createZediChatModel` / `recordUsage`.
 *
 * `GraphRunner.buildConfig` が唯一の正規生成者だが、テスト誤用や手動構築の
 * 防御として、必須フィールドの存在 (`userId`, `db`, `feature`) を浅く検証する。
 * Zod 等の重い依存は導入しない — 単一のプロデューサで保証している契約への
 * 二次防衛なので、shape check で十分（coderabbit review #956）。
 */
export function getGraphContext(config: LangGraphRunnableConfig | undefined): GraphContext {
  const configurable = config?.configurable as Record<string, unknown> | undefined;
  const candidate = configurable?.[GRAPH_CONTEXT_CONFIG_KEY];
  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      `Missing GraphContext on config.configurable["${GRAPH_CONTEXT_CONFIG_KEY}"]; ` +
        "GraphRunner is responsible for populating it.",
    );
  }
  const ctx = candidate as Partial<GraphContext>;
  const missing: string[] = [];
  if (typeof ctx.userId !== "string" || ctx.userId.length === 0) missing.push("userId");
  if (!ctx.db) missing.push("db");
  if (typeof ctx.feature !== "string" || ctx.feature.length === 0) missing.push("feature");
  if (missing.length > 0) {
    throw new Error(
      `GraphContext is missing required fields: ${missing.join(", ")}. ` +
        "Check GraphRunner.buildConfig.",
    );
  }
  const contentLocale =
    normalizeComposeContentLocale(ctx.contentLocale) ??
    normalizeComposeContentLocale((ctx as { locale?: unknown }).locale) ??
    "ja";
  return { ...(ctx as GraphContext), contentLocale };
}
