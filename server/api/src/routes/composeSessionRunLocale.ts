/**
 * Shared locale preparation for compose session run / projection routes.
 * compose セッション run / projection ルート向けのロケール準備を共通化する。
 */
import {
  readContentLocaleFromSessionMetadata,
  resolveSessionContentLocale,
  stripContentLocaleFromGraphInput,
  type ComposeContentLocale,
} from "../agents/core/composeLocale.js";

/** Result of preparing a `POST /run` request for LangGraph execution. */
export type ComposeRunLocalePrep = {
  contentLocale: ComposeContentLocale;
  graphInput: unknown;
  /** Metadata blob to persist on claim when locale is not yet stored. */
  metadataUpdate: Record<string, unknown> | undefined;
};

function mergeSessionMetadataWithLocale(
  metadata: unknown,
  contentLocale: ComposeContentLocale,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, contentLocale };
}

/**
 * Resolve content locale, strip it from graph input, and build metadata patch for first run.
 * contentLocale を解決し graph input から除去、初回 run 用 metadata 更新を組み立てる。
 */
export function prepareComposeRunFromRequest(
  sessionMetadata: unknown,
  rawInput: unknown,
  acceptLanguage: string | undefined | null,
  fallback: ComposeContentLocale = "ja",
): ComposeRunLocalePrep {
  const contentLocale = resolveSessionContentLocale(
    sessionMetadata,
    rawInput,
    acceptLanguage,
    fallback,
  );
  const shouldPersistLocale = !readContentLocaleFromSessionMetadata(sessionMetadata);
  const metadataUpdate = shouldPersistLocale
    ? mergeSessionMetadataWithLocale(sessionMetadata, contentLocale)
    : undefined;
  const graphInput = stripContentLocaleFromGraphInput(rawInput ?? {});
  return { contentLocale, graphInput, metadataUpdate };
}

/**
 * Resolve content locale for read / resume paths (no graph input or metadata patch).
 * GET / resume 向けに contentLocale のみ解決する。
 */
export function resolveComposeSessionContentLocale(
  sessionMetadata: unknown,
  rawInput: unknown | null,
  acceptLanguage: string | undefined | null,
  fallback: ComposeContentLocale = "ja",
): ComposeContentLocale {
  return resolveSessionContentLocale(sessionMetadata, rawInput, acceptLanguage, fallback);
}
