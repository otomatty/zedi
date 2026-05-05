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
    ai_suspected_files: z.array(suspectedFileSchema).nullable().optional(),
  })
  .strict();

/**
 * @typedef {z.infer<typeof analysisOutputSchema>} AnalysisOutput
 */

/**
 * Claude の生応答 (テキスト) から JSON を抽出して `analysisOutputSchema` で
 * 検証する。Claude は時々 ```json ... ``` のコードフェンスで包んだり前置きを
 * 付けたりするので、最初の `{` から最後の `}` までを切り出してパースする。
 *
 * Extract a JSON object from Claude's raw text response and validate it
 * against `analysisOutputSchema`. Claude occasionally wraps JSON in
 * ```json ... ``` fences or adds prose preambles, so we slice from the first
 * `{` to the last `}` rather than relying on `JSON.parse(raw)`. Throws
 * `Error` with a descriptive message on malformed JSON or schema violation.
 *
 * @param {string} raw - The raw text returned by Claude.
 * @returns {AnalysisOutput}
 */
export function parseAndValidate(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("Claude response was empty");
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate a JSON object in Claude response");
  }
  const slice = raw.slice(start, end + 1);
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(slice);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Claude response was not valid JSON: ${msg}`);
  }
  const result = analysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Claude response failed schema validation: ${result.error.message}`);
  }
  return result.data;
}
