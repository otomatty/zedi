/**
 * `GraphRunner` — orchestrates LangGraph runs for compose sessions.
 *
 * compose-session の実行を司るランナー。route 層が `start` / `streamEvents` /
 * `resume` を呼ぶ際の入口で、(1) registry からグラフを引く、(2) checkpointer を
 * 注入する、(3) `GraphContext` を `configurable` に詰める、を一手に引き受ける。
 *
 * Single entry point that the route layer uses to start, stream, or resume a
 * compose session. Owning the checkpointer + registry handoff in one place
 * keeps individual route handlers thin.
 */
import { Command, type BaseCheckpointSaver } from "@langchain/langgraph";
import { getRegisteredGraph, GraphNotRegisteredError } from "../registry/graphRegistry.js";
import type { GraphContext } from "../core/types/graphContext.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../core/types/graphContext.js";

/**
 * `GraphRunner` 共通入力。`context.threadId` を LangGraph `thread_id` に対応させる。
 * Common input passed to all `GraphRunner` methods.
 *
 * @property graphId       Registry に登録済みの論理 ID。Registered logical id.
 * @property context       Per-execution context propagated into `configurable`.
 * @property checkpointer  LangGraph checkpoint saver。Postgres or memory.
 * @property recursionLimit  LangGraph 再帰深度上限（既定 25）。Recursion limit.
 */
export interface RunInput {
  graphId: string;
  context: GraphContext;
  checkpointer: BaseCheckpointSaver | boolean;
  recursionLimit?: number;
}

/**
 * `start` / `resume` の payload を共通化するためのユニオン。`Command` を直接
 * 渡すか、ノードへの input オブジェクトを渡すかを区別する。
 *
 * Discriminates between "kick the graph with an input object" and "resume from
 * an interrupt via `Command`".
 */
export type RunPayload = { kind: "input"; value: unknown } | { kind: "command"; value: Command };

/**
 * 1 セッションの最終結果。successful run なら output、interrupt で停止したら
 * `interruptedAt` のノード名を持つ。
 *
 * Terminal result of a single run.
 */
export interface RunResult {
  status: "completed" | "interrupted" | "failed";
  output?: unknown;
  interruptedAt?: string;
  error?: string;
}

/**
 * `GraphRunner` の実体。stateless で、毎呼び出しごとに registry + checkpointer
 * を解決する。
 *
 * Stateless runner; resolves registry + checkpointer per call so the same
 * instance can serve many concurrent sessions.
 */
export class GraphRunner {
  /**
   * グラフを 1 回 invoke して結果を返す。ストリーミング不要なテストや、graph
   * の起動時セルフチェック用の薄い経路。
   *
   * One-shot `invoke`. Useful for tests and any non-streaming caller.
   */
  async invoke(input: RunInput, payload: RunPayload): Promise<RunResult> {
    const graph = this.resolveGraph(input.graphId, input.checkpointer);
    const config = this.buildConfig(input);
    try {
      const result = await graph.invoke(this.unwrapPayload(payload), config);
      return { status: "completed", output: result };
    } catch (err) {
      // Interrupts surface as throws in LangGraph; the route layer maps these
      // back to a 200 with `status: "interrupted"` so we do the same here.
      // LangGraph の interrupt は例外として伝搬する。`isGraphInterrupt` で判定。
      if (isInterruptError(err)) {
        return { status: "interrupted", interruptedAt: extractInterruptNode(err) };
      }
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * `streamEvents(version: "v2")` のラッパー。route 層から SSE に流すための
   * AsyncIterable を返す。`mapLangGraphEvent` でフィルタリングする想定だが、本層
   * では生イベントをそのまま流す（マッピング責務は呼び出し側）。
   *
   * Streams LangGraph runtime events. The caller (route layer) typically pipes
   * the result through `mapLangGraphEvent` from `sseMapper.ts`.
   */
  streamEvents(input: RunInput, payload: RunPayload): AsyncIterable<unknown> {
    const graph = this.resolveGraph(input.graphId, input.checkpointer);
    const config = this.buildConfig(input);
    // `streamEvents` returns an `IterableReadableStream<...>`; we return it as
    // `AsyncIterable<unknown>` to keep the runner's surface area provider-agnostic.
    return graph.streamEvents(this.unwrapPayload(payload), {
      ...config,
      version: "v2",
    }) as unknown as AsyncIterable<unknown>;
  }

  /**
   * `Command({ resume: ... })` を流して中断点から再開する。`patchState` は
   * `resume.value` に対する追加情報（ユーザー入力など）を載せる用途。
   *
   * Resume a previously-interrupted run by submitting a `Command({ resume })`
   * keyed by the session's `thread_id`.
   */
  async resume(
    input: RunInput,
    resumeValue: unknown,
    options?: { stream?: false },
  ): Promise<RunResult>;
  async resume(
    input: RunInput,
    resumeValue: unknown,
    options: { stream: true },
  ): Promise<AsyncIterable<unknown>>;
  async resume(
    input: RunInput,
    resumeValue: unknown,
    options?: { stream?: boolean },
  ): Promise<RunResult | AsyncIterable<unknown>> {
    const command = new Command({ resume: resumeValue });
    if (options?.stream) {
      return this.streamEvents(input, { kind: "command", value: command });
    }
    return this.invoke(input, { kind: "command", value: command });
  }

  private resolveGraph(graphId: string, checkpointer: BaseCheckpointSaver | boolean) {
    const registered = getRegisteredGraph(graphId);
    if (!registered) throw new GraphNotRegisteredError(graphId);
    return registered.factory({ checkpointer });
  }

  private buildConfig(input: RunInput) {
    return {
      configurable: {
        thread_id: input.context.threadId,
        [GRAPH_CONTEXT_CONFIG_KEY]: input.context,
      },
      recursionLimit: input.recursionLimit ?? 25,
    };
  }

  private unwrapPayload(payload: RunPayload): unknown {
    return payload.kind === "command" ? payload.value : payload.value;
  }
}

/**
 * LangGraph の interrupt 例外判定。`isGraphInterrupt` を直接 import すると
 * 循環依存のリスクがあるため、本ファイルでは structural にチェックする。
 *
 * Structural check for LangGraph `GraphInterrupt`. We avoid importing the
 * symbol directly to keep this module decoupled from LangGraph internals.
 */
function isInterruptError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" && /Interrupt/.test(name);
}

function extractInterruptNode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const node = (err as { node?: unknown }).node;
  return typeof node === "string" ? node : undefined;
}
