/**
 * Content locale for Wiki Compose LLM outputs (#950).
 * Wiki Compose の生成言語（ユーザー向けテキスト）を表す。
 */
import { resolveLocaleFromAcceptLanguage } from "../../services/invitationService.js";

export type ComposeContentLocale = "ja" | "en";

/**
 * Normalize an arbitrary value to a supported compose content locale.
 * 任意の入力をサポートされる compose 用ロケールに正規化する。
 */
export function normalizeComposeContentLocale(raw: unknown): ComposeContentLocale | null {
  if (raw === "ja" || raw === "en") return raw;
  return null;
}

/**
 * Resolve locale from graph run input (`contentLocale`) with a server default.
 * graph の run input（`contentLocale`）からロケールを解決する。
 */
export function resolveComposeContentLocale(
  input: unknown,
  acceptLanguage: string | undefined | null,
  fallback: ComposeContentLocale = "ja",
): ComposeContentLocale {
  if (input && typeof input === "object" && "contentLocale" in input) {
    const fromInput = normalizeComposeContentLocale(
      (input as { contentLocale?: unknown }).contentLocale,
    );
    if (fromInput) return fromInput;
  }
  const fromHeader = resolveLocaleFromAcceptLanguage(acceptLanguage);
  if (fromHeader) return fromHeader;
  return fallback;
}

/**
 * Read persisted `contentLocale` from a compose session metadata blob.
 * compose セッション metadata に保存された `contentLocale` を読む。
 */
export function readContentLocaleFromSessionMetadata(
  metadata: unknown,
): ComposeContentLocale | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return normalizeComposeContentLocale((metadata as Record<string, unknown>).contentLocale);
}

/**
 * Resolve locale for a session: metadata (first run) → input → Accept-Language → fallback.
 * セッション用ロケール解決: metadata（初回 run で固定）→ input → Accept-Language。
 */
export function resolveSessionContentLocale(
  metadata: unknown,
  input: unknown,
  acceptLanguage: string | undefined | null,
  fallback: ComposeContentLocale = "ja",
): ComposeContentLocale {
  const persisted = readContentLocaleFromSessionMetadata(metadata);
  if (persisted) return persisted;
  return resolveComposeContentLocale(input, acceptLanguage, fallback);
}

/**
 * Strip `contentLocale` before passing input to LangGraph (not a state channel).
 * LangGraph に渡す前に `contentLocale` を除去する（state チャネルではない）。
 */
export function stripContentLocaleFromGraphInput(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== "object" || Array.isArray(raw)) return raw;
  const { contentLocale: _removed, ...rest } = raw as Record<string, unknown>;
  return rest;
}

/**
 * Instruction appended to system prompts so questions, outlines, and drafts
 * match the user's UI language.
 * 質問・アウトライン・本文が UI 言語と一致するよう system prompt に付与する。
 */
export function composeContentLocaleInstruction(locale: ComposeContentLocale): string {
  if (locale === "ja") {
    return (
      "\n\nLanguage: Write all user-facing text (questions, option labels, rationales, " +
      "outline headings and intents, evaluation rationales, missing aspects, and article " +
      "body) in Japanese. Use clear, natural Japanese suitable for a wiki article."
    );
  }
  return (
    "\n\nLanguage: Write all user-facing text (questions, option labels, rationales, " +
    "outline headings and intents, evaluation rationales, missing aspects, and article " +
    "body) in English."
  );
}

/**
 * Localized conflict-resolution rationale shown in the interrupt UI.
 * interrupt UI に表示する矛盾解消用の説明文（ロケール別）。
 */
export function composeConflictRationale(locale: ComposeContentLocale): string {
  if (locale === "ja") {
    return (
      "却下したソースと採用したソースが混在しています。採用したソースのセットで" +
      "アウトライン生成に進んでよいか確認してください。"
    );
  }
  return (
    "Multiple sources were rejected while others were kept. Confirm you want to proceed " +
    "with the approved set before generating the outline."
  );
}

/** Default outline rows when structure LLM fails (locale-specific headings). */
export function structureDialogueFallbackOutline(
  locale: ComposeContentLocale,
): Array<{ heading: string; depth: 1; intent: string }> {
  if (locale === "ja") {
    return [
      { heading: "概要", depth: 1, intent: "トピックの簡潔な導入。" },
      { heading: "要点", depth: 1, intent: "主要な事実と背景。" },
      { heading: "参考", depth: 1, intent: "出典と関連情報。" },
    ];
  }
  return [
    { heading: "Overview", depth: 1, intent: "Brief introduction to the topic." },
    { heading: "Key points", depth: 1, intent: "Main facts and context." },
    { heading: "References", depth: 1, intent: "Sources and further reading." },
  ];
}
