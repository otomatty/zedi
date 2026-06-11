/**
 * Typed wrappers over `dispatchCustomEvent` for the Wiki Compose orchestrator
 * graph (#950).
 *
 * `dispatchCustomEvent` を経由して `compose_phase` / `compose_section` の
 * custom event を発火する薄いラッパ。`sseMapper.mapCustomEvent` がペイロード
 * shape を検証するため、ここでは型付きで dispatch するだけで良い。
 */
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ComposeCompletion } from "../../types.js";

/** Payload shape for `compose_phase` custom events. */
export interface ComposePhasePayload {
  phase: "brief" | "research" | "structure" | "draft" | "completed";
  status: "entered" | "completed";
}

/** Payload shape for `compose_section` custom events. */
export interface ComposeSectionPayload {
  sectionId: string;
  heading: string;
  status: "started" | "completed";
  index: number;
  total: number;
}

/** Dispatch a `compose_phase` SSE custom event. */
export async function dispatchComposePhase(
  payload: ComposePhasePayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("compose_phase", payload, config);
}

/** Dispatch a `compose_section` SSE custom event. */
export async function dispatchComposeSection(
  payload: ComposeSectionPayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("compose_section", payload, config);
}

/** Payload shape for `compose_completion` custom events. */
export interface ComposeCompletionPayload {
  completion: ComposeCompletion;
}

/**
 * Dispatch a `compose_completion` SSE custom event carrying the full final
 * completion (markdown + sections + comprehension aids). Used by instant-mode
 * runs to deliver the article in a single SSE stream.
 */
export async function dispatchComposeCompletion(
  payload: ComposeCompletionPayload,
  config: LangGraphRunnableConfig,
): Promise<void> {
  await dispatchCustomEvent("compose_completion", payload, config);
}
