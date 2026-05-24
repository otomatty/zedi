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
import {
  GRAPH_CONTEXT_CONFIG_KEY,
  type GraphContext,
} from "../../../../core/types/graphContext.js";

/**
 * Returns the `GraphContext` injected by `GraphRunner.buildConfig`. Throws
 * when missing so misconfigured callers fail loudly instead of silently
 * running with default credentials.
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
  return candidate as GraphContext;
}
