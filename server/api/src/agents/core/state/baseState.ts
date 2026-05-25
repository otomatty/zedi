/**
 * Base LangGraph state shared by all Wiki Compose subgraphs.
 *
 * 全 Wiki Compose subgraph で共通利用する LangGraph state。各 subgraph (#949,
 * #950, ...) はこの annotation を `Annotation.Root({...BaseState.spec, ...})`
 * で拡張する想定。messages reducer は `messagesStateReducer` を使い、tool 結果や
 * ai 応答の追記をフラットに扱う。
 *
 * The Wiki Compose family of subgraphs (P1 research, P2 outline, P3 draft …)
 * all need a messages history plus a few cross-cutting fields. `BaseState`
 * defines that shared shell; downstream graphs spread its `spec` into their
 * own `Annotation.Root({...})` to extend it.
 */
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * 共通 state スキーマ。
 * Shared state schema.
 *
 * - `messages` — LangGraph 規約に従い、reducer で append する。
 * - `phase`    — 現在のフェーズ名（subgraph 横断の進行管理）。
 * - `pageId`   — 対象ページ。サブグラフが書き戻し対象を見失わないために state にも持つ。
 * - `userId`   — 実行ユーザー。tool が page アクセス権チェックを行う際に参照する。
 */
export const BaseState = Annotation.Root({
  /**
   * 会話履歴 + tool 結果。`messagesStateReducer` で append マージする。
   * Conversation + tool messages, accumulated via `messagesStateReducer`.
   */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  /**
   * 現在のフェーズ識別子。subgraph 間遷移で書き換えられる。
   * Current phase identifier; rewritten when transitioning between subgraphs.
   */
  phase: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "init",
  }),
  /**
   * 対象ページ ID。
   * Target page id.
   */
  pageId: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  /**
   * 実行ユーザー ID。
   * Executing user id.
   */
  userId: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
});

/**
 * `BaseState` の `State` 型エイリアス。subgraph 側でも `typeof BaseState.State` で
 * 取得できるが、よく使うため再 export する。
 *
 * Convenience type alias for `typeof BaseState.State`.
 */
export type BaseStateType = typeof BaseState.State;

/**
 * `BaseState` の `Update` 型エイリアス。ノードの返却型として使う。
 * Convenience type alias for `typeof BaseState.Update`.
 */
export type BaseStateUpdate = typeof BaseState.Update;
