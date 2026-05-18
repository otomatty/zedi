/**
 * Claude による API エラー解析結果の出力 JSON スキーマ。Epic #616 Phase 2 /
 * Issue #806 のコールバック (`PUT /api/webhooks/github/ai-result/:id`) が
 * 受け取る形と 1:1 で対応する。
 *
 * Output JSON schema for the Claude AI error-analysis step (Epic #616 Phase 2 /
 * issue #806). Mirrors the shape accepted by the API callback at
 * `PUT /api/webhooks/github/ai-result/:id` so the workflow can `PUT` the
 * validated payload directly.
 *
 * The server-side service `updateAiAnalysis` (server/api/src/services/apiErrorService.ts)
 * is the canonical validator; this schema must stay aligned with that
 * function's expectations.
 *
 * @see ../../../server/api/src/services/apiErrorService.ts
 * @see ../../../server/api/src/routes/webhooks/githubAiCallback.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/806
 */
import { z } from "zod";

/**
 * AI が判定する重大度。サーバ側 `ApiErrorSeverity` と完全一致させる。
 * Severity enum kept in lockstep with the server's `ApiErrorSeverity`.
 */
export const SEVERITIES = /** @type {const} */ (["high", "medium", "low", "unknown"]);

/**
 * AI が「関連しそう」と判断したファイルエントリ。サーバ側 `ApiErrorSuspectedFile`
 * の境界バリデーションと一致させる（`path` 必須、`reason` / `line` は任意）。
 *
 * Suspected file entry. Matches the server's `validateSuspectedFiles` boundary
 * checks: `path` is required and non-empty; `reason` and `line` are optional.
 */
export const suspectedFileSchema = z
  .object({
    path: z.string().min(1, "path must be a non-empty string"),
    reason: z.string().optional(),
    line: z.number().int().finite().optional(),
  })
  .strict();

/**
 * AI 解析結果ペイロードのスキーマ。コールバックは部分更新を許容するが、ここでは
 * 「ワークフローが生成した完全な解析」を返す前提なので、`severity` と `ai_summary`
 * は必須にしておき、欠落を CI 段階で弾く。
 *
 * Full analysis payload schema. The callback endpoint accepts partial updates
 * for resilience, but the workflow always emits a complete analysis, so we
 * require `severity` and `ai_summary` here to fail fast on a malformed Claude
 * response rather than silently posting a half-empty record.
 */
export const analysisOutputSchema = z
  .object({
    severity: z.enum(SEVERITIES),
    ai_summary: z.string().min(1, "ai_summary must be a non-empty string"),
    ai_root_cause: z.string().nullable().optional(),
    ai_suggested_fix: z.string().nullable().optional(),
    // 最大 5 件は `prompt.md` と README に明示している契約。Claude が指示を無視して
    // 大量に返してきた場合に CI で弾く（API に 6 件以上を書き戻さない）。
    // The 5-entry cap is a contract documented in `prompt.md` and the README.
    // Enforce it at the schema layer so a Claude response that ignores the
    // instruction (and returns 6+ files) fails CI rather than being PUT to
    // the API with an oversized list.
    ai_suspected_files: z
      .array(suspectedFileSchema)
      .max(5, "ai_suspected_files must have at most 5 entries")
      .nullable()
      .optional(),
  })
  .strict();

/**
 * @typedef {z.infer<typeof analysisOutputSchema>} AnalysisOutput
 */

/**
 * @param {string} str
 * @param {number} startIdx - index of `{`
 * @returns {string | null} balanced JSON object substring or null
 */
function extractBalancedJsonObject(str, startIdx) {
  if (str[startIdx] !== "{") return null;
  let depth = 0;
  let inString = false;
  let stringEscape = false;
  for (let i = startIdx; i < str.length; i++) {
    const c = str[i];
    if (stringEscape) {
      stringEscape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        stringEscape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return null;
}

/**
 * トップレベル解析ペイロードの「形」か（severity / ai_summary のキーが両方あるか）。
 * 型までは見ない。誤った型のオブジェクトでもキーが揃っていればルート意図とみなし、
 * 後続の別オブジェクトへフォールスルーしない（誤採択防止）。
 *
 * Whether `value` looks like the intended root analysis object (both `severity` and
 * `ai_summary` own keys). Types are not checked: malformed values still fail fast via
 * schema throw instead of scanning for a later unrelated JSON object.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeAnalysisPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = /** @type {Record<string, unknown>} */ (value);
  return Object.hasOwn(o, "severity") && Object.hasOwn(o, "ai_summary");
}

/**
 * ```json ... ``` フェンスがあれば内側だけを返す（なければそのまま）。
 * 言語ラベル無しの ``` ... ``` は JSON とみなさずそのままにする（誤ってコードブロックを剥がさない）。
 *
 * If an explicit ```json ... ``` fence exists, return the inner body; otherwise raw.
 * Plain ``` ... ``` fences are left intact so non-JSON fenced blocks are not stripped.
 *
 * @param {string} raw
 * @returns {string}
 */
function stripMarkdownJsonFence(raw) {
  const m = raw.match(/```json\s*([\s\S]*?)```/im);
  return m ? m[1].trim() : raw;
}

/**
 * Claude の生応答 (テキスト) から JSON を抽出して `analysisOutputSchema` で
 * 検証する。フェンスや前置きに加え、本文中の `{}` がバランスしない場合でも、
 * 各 `{` 起点で括弧バランスを取った候補を順に試して最初にスキーマ合格したものを採用する。
 *
 * Extract and validate analysis JSON from Claude's raw text. Besides fences and
 * prose, stray `{}` pairs in preambles are handled by scanning each `{` start,
 * taking the balanced span, and accepting the first candidate that passes the
 * Zod schema (instead of slicing first `{` to last `}`).
 *
 * @param {string} raw - The raw text returned by Claude.
 * @returns {AnalysisOutput}
 */
export function parseAndValidate(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("Claude response was empty");
  }
  const normalized = stripMarkdownJsonFence(raw);
  /** @type {string | null} */
  let lastJsonError = null;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] !== "{") continue;
    const slice = extractBalancedJsonObject(normalized, i);
    if (!slice) continue;
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(slice);
    } catch (err) {
      lastJsonError = err instanceof Error ? err.message : String(err);
      continue;
    }
    const result = analysisOutputSchema.safeParse(parsed);
    if (result.success) return result.data;
    lastJsonError = result.error.message;
    if (looksLikeAnalysisPayload(parsed)) {
      throw new Error(`Claude response failed schema validation: ${lastJsonError}`);
    }
  }
  const suffix = lastJsonError ? `: ${lastJsonError}` : "";
  throw new Error(`Could not locate valid analysis JSON in Claude response${suffix}`);
}
