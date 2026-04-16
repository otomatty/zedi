/**
 * Ingest Planner — LLM Wiki pattern, P1 (otomatty/zedi#595).
 *
 * Decides how a newly-extracted article should be merged into the user's
 * existing Wiki. Produces an {@link IngestPlan} JSON with one of three
 * actions:
 *
 * - `"merge"`  — append / integrate the article into an existing page
 * - `"create"` — create a fresh page from the article
 * - `"skip"`   — the article has no novel information worth storing
 *
 * ユーザーの既存 Wiki に対してクリップした記事をどう統合するかを LLM に
 * 判断させるプランナー。merge / create / skip のいずれかを JSON で返す。
 *
 * この段階では DB への書き込みは行わない（dry-run）。受け入れ操作は
 * 後続 PR の apply エンドポイントで実装する。
 *
 * @see https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
 */
import type { AIMessage, AIProviderType } from "../types/index.js";

/**
 * Ingest プランが取れるアクション。
 * Possible actions an ingest plan can propose.
 */
export type IngestAction = "merge" | "create" | "skip";

/**
 * 既存ページの候補。プランナーがマージ先を選ぶための最小情報。
 * Minimal shape of an existing wiki page passed to the planner as a candidate.
 *
 * @property id - 候補ページの UUID。Candidate page UUID.
 * @property title - ページタイトル。Page title.
 * @property excerpt - ページの先頭プレビュー（最大数百文字）。Short preview of the page body.
 */
export interface CandidatePage {
  id: string;
  title: string;
  excerpt: string;
}

/**
 * 抽出済み記事のうち、プランナーに渡す最小限の情報。
 * The subset of an extracted article passed to the planner.
 *
 * @property title - 記事タイトル。Article title.
 * @property url - ソース URL。Source URL.
 * @property excerpt - 記事のプレーンテキスト先頭（最大数千文字）。Article plain-text excerpt.
 */
export interface IngestArticleSummary {
  title: string;
  url: string;
  excerpt: string;
}

/**
 * マージ時に記録する矛盾情報。
 * A conflict recorded while merging the article into an existing page.
 *
 * @property claim - ソース側の主張。The claim from the new source.
 * @property existing - 既存ページ側の記述。The claim in the existing page.
 * @property note - 説明（任意）。Optional human-readable note.
 */
export interface IngestConflict {
  claim: string;
  existing: string;
  note?: string;
}

/**
 * LLM が返す ingest プラン。
 * Plan returned by the LLM. The payload is validated by {@link parseIngestPlanResponse}.
 *
 * @property action - 実行アクション。Action to perform.
 * @property reason - 判断理由（ユーザー向けに必ず入れる）。Human-readable rationale.
 * @property targetPageId - merge 時のマージ先ページ ID。Target page id when action="merge".
 * @property title - create 時の新規タイトル。New page title when action="create".
 * @property summary - ユーザー向けの 1 行要約（採用 UI に表示）。1-line summary for UI.
 * @property conflicts - 検出した矛盾（任意）。Detected conflicts (optional).
 */
export interface IngestPlan {
  action: IngestAction;
  reason: string;
  targetPageId?: string;
  title?: string;
  summary?: string;
  conflicts?: IngestConflict[];
}

/**
 * プロンプト組み立てに渡す入力。
 * Input for {@link buildIngestPlannerPrompt}.
 *
 * @property article - 抽出済み記事の要約。Article summary.
 * @property candidates - 既存ページ候補（search でヒットした上位 N 件）。Candidate pages.
 * @property userSchema - ユーザー定義スキーマ（P3 で実装。現状は未設定時は undefined）。Optional user-defined wiki schema.
 */
export interface BuildIngestPlannerPromptInput {
  article: IngestArticleSummary;
  candidates: CandidatePage[];
  userSchema?: string;
}

const SYSTEM_PROMPT_JA_EN = `
You are the ingest planner for a personal AI-maintained knowledge wiki.
あなたはパーソナル AI 知識 Wiki の ingest プランナーです。

Given one newly-extracted ARTICLE and up to N CANDIDATE existing pages,
decide one of:
  - "merge":  the article extends a specific candidate page; return targetPageId
  - "create": no candidate is a good fit; return a concise new page title
  - "skip":   the article has no novel or valuable information

Rules / ルール:
  1. Prefer "merge" when a candidate page clearly covers the same entity.
  2. Prefer "create" when the article introduces a distinct entity not covered.
  3. Use "skip" sparingly — only when the article is noise or exact duplicate.
  4. Always return a concise "reason" in the user's language.
  5. If you detect a factual contradiction with an existing page, record it
     under "conflicts" with "claim" (from the new article) and "existing"
     (from the candidate page).
  6. Respond with STRICT JSON only — no markdown, no prose outside JSON.

Response JSON schema / レスポンス JSON スキーマ:
{
  "action": "merge" | "create" | "skip",
  "reason": string,
  "targetPageId": string (only when action="merge"),
  "title":        string (only when action="create"),
  "summary":      string (one-line user-facing summary; optional),
  "conflicts": [ { "claim": string, "existing": string, "note"?: string } ]
}
`.trim();

/**
 * 記事・候補・（任意の）ユーザースキーマから LLM メッセージ列を組み立てる。
 * Builds the LLM message list from article + candidates + optional user schema.
 *
 * @param input - プロンプトの入力。Prompt input.
 * @returns LLM へ渡す `AIMessage[]`。Messages array ready for `callProvider`.
 */
export function buildIngestPlannerPrompt(input: BuildIngestPlannerPromptInput): AIMessage[] {
  const { article, candidates, userSchema } = input;

  const systemParts = [SYSTEM_PROMPT_JA_EN];
  if (userSchema && userSchema.trim().length > 0) {
    systemParts.push(
      `User-defined wiki schema (apply when choosing titles and sections):\n${userSchema.trim()}`,
    );
  }

  const candidatesBlock =
    candidates.length === 0
      ? "(no candidates)"
      : candidates
          .map(
            (c, i) =>
              `[${i + 1}] id=${c.id}\n    title: ${c.title}\n    excerpt: ${truncate(c.excerpt, 400)}`,
          )
          .join("\n\n");

  const userMessage = [
    `## ARTICLE`,
    `title: ${article.title}`,
    `url:   ${article.url}`,
    `excerpt:`,
    truncate(article.excerpt, 4000),
    ``,
    `## CANDIDATES`,
    candidatesBlock,
    ``,
    `Produce the ingest plan as strict JSON per the schema above.`,
  ].join("\n");

  return [
    { role: "system", content: systemParts.join("\n\n") },
    { role: "user", content: userMessage },
  ];
}

/**
 * 文字列を指定長に切り詰める（Unicode コードポイント単位でサロゲートペアを壊さない）。
 * Truncates a string to at most `max` Unicode code points.
 * Uses `Array.from` so surrogate pairs (emoji etc.) are never split.
 */
function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("").trimEnd() + "…";
}

/**
 * LLM レスポンステキストから JSON を抽出する。Markdown ``` で囲まれていても剥がす。
 * Extracts the JSON object out of an LLM response, tolerating ```json fences.
 */
export function extractJsonFromResponse(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  // Fall back: find first "{" and last "}".
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

/**
 * パース / バリデーション失敗時のエラー。
 * Thrown when the LLM response cannot be validated into an {@link IngestPlan}.
 */
export class IngestPlanParseError extends Error {
  /**
   * @param message - エラーメッセージ。Error message.
   */
  constructor(message: string) {
    super(message);
    this.name = "IngestPlanParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseConflicts(value: unknown): IngestConflict[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const out: IngestConflict[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const claim = asNonEmptyString(entry.claim);
    const existing = asNonEmptyString(entry.existing);
    if (!claim || !existing) continue;
    const note = asNonEmptyString(entry.note);
    out.push(note ? { claim, existing, note } : { claim, existing });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * LLM の生応答を厳格にパース・バリデーションして {@link IngestPlan} を返す。
 * Strictly validates an LLM raw response and returns a typed {@link IngestPlan}.
 *
 * @param raw - LLM の生テキスト応答。Raw LLM text response.
 * @param options - 候補ページ ID の集合（merge 時の整合性チェック用）。Set of candidate IDs.
 * @returns 検証済みプラン。Validated ingest plan.
 * @throws {@link IngestPlanParseError} when JSON is malformed or fields are invalid.
 */
export function parseIngestPlanResponse(
  raw: string,
  options: { validCandidateIds?: ReadonlySet<string> } = {},
): IngestPlan {
  const jsonText = extractJsonFromResponse(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new IngestPlanParseError(`Invalid JSON in LLM response: ${reason}`);
  }

  if (!isRecord(parsed)) {
    throw new IngestPlanParseError("Plan must be a JSON object");
  }

  const actionRaw = parsed.action;
  if (actionRaw !== "merge" && actionRaw !== "create" && actionRaw !== "skip") {
    throw new IngestPlanParseError(`Invalid action: ${JSON.stringify(actionRaw)}`);
  }
  const action = actionRaw as IngestAction;

  const reason = asNonEmptyString(parsed.reason);
  if (!reason) {
    throw new IngestPlanParseError(`"reason" is required`);
  }

  const plan: IngestPlan = { action, reason };

  const summary = asNonEmptyString(parsed.summary);
  if (summary) plan.summary = summary;

  const conflicts = parseConflicts(parsed.conflicts);
  if (conflicts) plan.conflicts = conflicts;

  if (action === "merge") {
    const targetPageId = asNonEmptyString(parsed.targetPageId);
    if (!targetPageId) {
      throw new IngestPlanParseError(`"targetPageId" is required when action="merge"`);
    }
    if (options.validCandidateIds && !options.validCandidateIds.has(targetPageId)) {
      throw new IngestPlanParseError(
        `targetPageId ${targetPageId} is not in candidate list — LLM hallucinated a page ID`,
      );
    }
    plan.targetPageId = targetPageId;
  }

  if (action === "create") {
    const title = asNonEmptyString(parsed.title);
    if (!title) {
      throw new IngestPlanParseError(`"title" is required when action="create"`);
    }
    plan.title = title;
  }

  return plan;
}

/**
 * LLM ドライバの型。provider / model / apiKey を束ねたコールバック。
 * LLM driver interface — a callback that wraps provider / model / apiKey.
 *
 * Kept as an interface (not a hard dependency on `callProvider`) so tests can
 * inject a deterministic fake without network I/O.
 */
export interface IngestLlmDriver {
  /**
   * AIMessage[] を受け取って生テキスト応答を返す。
   * Takes an AIMessage array and returns a raw text response.
   */
  (messages: AIMessage[]): Promise<string>;
}

/**
 * `planIngest` 入力。
 * Input for {@link planIngest}.
 *
 * @property article - 抽出済み記事。Extracted article summary.
 * @property candidates - 既存ページ候補。Existing page candidates.
 * @property llm - LLM ドライバ。LLM driver callback.
 * @property userSchema - ユーザー定義スキーマ（任意）。Optional user-defined schema.
 */
export interface PlanIngestInput {
  article: IngestArticleSummary;
  candidates: CandidatePage[];
  llm: IngestLlmDriver;
  userSchema?: string;
}

/**
 * プラン生成のオーケストレーション。プロンプト組み立て → LLM 呼び出し → パースを行う。
 * End-to-end orchestration: build prompt → call LLM → parse response.
 *
 * @param input - 入力。Input.
 * @returns 検証済みプラン。Validated {@link IngestPlan}.
 * @throws {@link IngestPlanParseError} when the LLM response is malformed.
 */
export async function planIngest(input: PlanIngestInput): Promise<IngestPlan> {
  const messages = buildIngestPlannerPrompt({
    article: input.article,
    candidates: input.candidates,
    userSchema: input.userSchema,
  });
  const raw = await input.llm(messages);
  const validCandidateIds = new Set(input.candidates.map((c) => c.id));
  return parseIngestPlanResponse(raw, { validCandidateIds });
}

/**
 * `callProvider` 互換の関数をラップして {@link IngestLlmDriver} を作る薄いヘルパー。
 * Adapter wrapping a provider-call function into an {@link IngestLlmDriver}.
 *
 * `callProvider` のインポートをテストに持ち込まずに済むよう、関数を注入する形に
 * している。プロダクションコードからは route 層で {@link callProvider} を注入する。
 */
export interface CallProviderAdapter {
  (
    provider: AIProviderType,
    apiKey: string,
    model: string,
    messages: AIMessage[],
  ): Promise<{ content: string }>;
}

/**
 * Provider 設定から `IngestLlmDriver` を作成する。
 * Creates an {@link IngestLlmDriver} bound to a specific provider/model/key.
 *
 * @param adapter - `callProvider` 互換の関数。A function with the same shape as `callProvider`.
 * @param config - プロバイダ・モデル・API キー。Provider / model / api key.
 * @returns LLM ドライバ関数。LLM driver.
 */
export function createIngestLlmDriver(
  adapter: CallProviderAdapter,
  config: { provider: AIProviderType; model: string; apiKey: string },
): IngestLlmDriver {
  return async (messages) => {
    const result = await adapter(config.provider, config.apiKey, config.model, messages);
    return result.content;
  };
}
