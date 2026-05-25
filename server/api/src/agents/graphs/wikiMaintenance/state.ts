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

export type WikiMaintenanceStateType = typeof WikiMaintenanceState.State;
export type WikiMaintenanceStateUpdate = typeof WikiMaintenanceState.Update;
