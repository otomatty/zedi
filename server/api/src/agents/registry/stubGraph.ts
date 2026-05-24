/**
 * Stub Wiki Compose graph used by the P0 plumbing.
 *
 * `wiki-compose-stub` グラフ。P0 (#948) 段階で `GraphRunner` がレジストリ経由で
 * グラフを実行できることを確認するための最小グラフ。1 ノードで `phase` を
 * "completed" にして終了する。本物の調査・outline・draft グラフは #949 以降で
 * 別 graphId として登録する。
 *
 * Minimal compiled graph for P0 wiring tests. Real Wiki Compose subgraphs land
 * in #949+ under separate ids; this stub stays as a smoke-test fixture.
 */
import { END, START, StateGraph } from "@langchain/langgraph";
import { BaseState } from "../core/state/baseState.js";
import { registerGraph, type GraphFactory } from "./graphRegistry.js";

/** Registered id for the stub graph. スタブグラフの登録 ID。 */
export const STUB_GRAPH_ID = "wiki-compose-stub" as const;

const stubFactory: GraphFactory = ({ checkpointer }) => {
  const builder = new StateGraph(BaseState)
    .addNode("noop", async (_state) => ({ phase: "completed" }))
    .addEdge(START, "noop")
    .addEdge("noop", END);
  return builder.compile({ checkpointer });
};

/**
 * Register the stub graph. Called from app bootstrap so the runner can resolve
 * it via `graphId="wiki-compose-stub"`.
 *
 * スタブグラフを登録する。app 起動時に 1 度呼ぶ。
 */
export function registerStubGraph(): void {
  registerGraph({
    id: STUB_GRAPH_ID,
    version: "0.1.0",
    phase: "stub",
    description:
      "P0 wiring smoke test graph. Marks the session 'completed' and exits. Not for production composing.",
    factory: stubFactory,
  });
}
