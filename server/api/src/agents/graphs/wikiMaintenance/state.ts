/**
 * `WikiMaintenanceState` — LangGraph state for wiki maintenance (#953).
 */
import { Annotation } from "@langchain/langgraph";
import { BaseState } from "../../core/state/baseState.js";
import type { MaintenanceFinding, MaintenancePlan } from "./types.js";

export const WikiMaintenanceState = Annotation.Root({
  ...BaseState.spec,
  brokenLinkFindings: Annotation<MaintenanceFinding[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  stubPageFindings: Annotation<MaintenanceFinding[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  maintenancePlan: Annotation<MaintenancePlan | null>({
    reducer: (prev, next) => (next === undefined ? prev : next),
    default: () => null,
  }),
});

/**
 * Materialized state shape for wiki maintenance graph execution.
 * Wiki メンテナンス graph 実行時の確定 state 形状。
 */
export type WikiMaintenanceStateType = typeof WikiMaintenanceState.State;
/**
 * Partial update returned by wiki maintenance nodes.
 * Wiki メンテナンス各ノードが返す部分更新。
 */
export type WikiMaintenanceStateUpdate = typeof WikiMaintenanceState.Update;
