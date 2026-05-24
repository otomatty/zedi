/**
 * Graph registry — maps a logical `graphId` to a factory that produces a
 * compiled LangGraph.
 *
 * Wiki Compose は複数のグラフ (P1 調査, P2 outline, P3 draft, ...) を
 * `graphId` で切り替える。本ファイルは「論理 ID → コンパイル済みグラフを
 * 返すファクトリ」のマップを 1 つに集約し、route 層・GraphRunner からは
 * registry を介してのみグラフを引く。
 *
 * Each compose session is parameterised by a `graphId` so the platform can
 * evolve P1..P4 subgraphs independently. The registry is the only place where
 * `graphId → graph` mapping lives — routes and the runner depend on it, never
 * on concrete graph modules.
 */
import type { BaseCheckpointSaver } from "@langchain/langgraph";

/**
 * LangGraph `compile()` の戻り値はジェネリック型パラメータが多すぎて registry
 * 側で完全に再現できない。registry は run / streamEvents / invoke の呼び出し
 * できる最小契約だけ要求する構造的な型を使う。
 *
 * `CompiledGraph` from LangGraph is heavily generic; pinning all type
 * parameters in the registry would force every subgraph to re-export them.
 * The registry only relies on the runtime methods used by `GraphRunner`, so
 * a structural type covers our needs without leaking generic parameters.
 */
export interface CompiledGraphLike {
  invoke(input: unknown, options?: unknown): Promise<unknown>;
  stream(input: unknown, options?: unknown): Promise<unknown>;
  streamEvents(input: unknown, options: unknown): unknown;
}

/**
 * グラフファクトリ。1 セッションごとに呼ばれ、必要なら checkpointer を bake する。
 * Graph factory: called once per session; may consume the runtime checkpointer.
 *
 * @param ctx.checkpointer  実行時に GraphRunner が注入する LangGraph saver。
 *                          The checkpointer injected by the runner at execution time.
 * @returns CompiledGraph   `compile()` 済みのグラフインスタンス。
 *                          Compiled graph instance returned by `StateGraph.compile()`.
 */
export interface GraphFactoryInput {
  checkpointer: BaseCheckpointSaver | boolean;
}
export interface GraphFactory {
  (input: GraphFactoryInput): CompiledGraphLike;
}

/**
 * グラフ定義のメタ情報。registry が外部に公開する unit。
 * Registered graph descriptor.
 *
 * @property id           論理 ID。Route layer / DB の `graphId` カラム。
 * @property version      バージョン文字列。デプロイ間で挙動が変わった時に bump。
 * @property phase        グラフが属するフェーズ識別子（"research", "draft" 等）。
 * @property description  Human-readable 説明。Admin UI 等で利用。
 * @property factory      コンパイル済みグラフを返すファクトリ。
 */
export interface RegisteredGraph {
  id: string;
  version: string;
  phase: string;
  description: string;
  factory: GraphFactory;
}

const registry = new Map<string, RegisteredGraph>();

/**
 * Register a graph. Calling twice with the same id replaces the previous entry
 * (intended for hot-reload during dev / test).
 *
 * グラフを登録する。同じ id を 2 度登録すると上書きされる（dev / test 向け）。
 */
export function registerGraph(graph: RegisteredGraph): void {
  registry.set(graph.id, graph);
}

/**
 * Look up a registered graph by id.
 * 登録済みグラフを id で取得する。未登録なら undefined。
 */
export function getRegisteredGraph(id: string): RegisteredGraph | undefined {
  return registry.get(id);
}

/**
 * 全登録グラフを列挙する。管理画面・デバッグ用。
 * Enumerate all registered graphs.
 */
export function listRegisteredGraphs(): RegisteredGraph[] {
  return Array.from(registry.values());
}

/**
 * テスト用：レジストリをクリアする。
 * Test-only: clear the registry.
 */
export function __resetRegistryForTests(): void {
  registry.clear();
}

/**
 * `graphId` 未登録時の例外。route 層で 400 に変換する。
 *
 * Thrown by the runner when a session references an unknown `graphId`. The
 * route layer should translate this into a 400, since the value comes from
 * client input.
 */
export class GraphNotRegisteredError extends Error {
  readonly code = "GRAPH_NOT_REGISTERED";
  readonly graphId: string;
  constructor(graphId: string) {
    super(`No graph registered with id="${graphId}"`);
    this.name = "GraphNotRegisteredError";
    this.graphId = graphId;
  }
}
