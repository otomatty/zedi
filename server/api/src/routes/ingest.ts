/**
 * /api/ingest — LLM Wiki ingest flow (P1 #595, graph P4 #952).
 *
 * POST /api/ingest/plan — dry-run: given a URL, propose how the article should
 * be merged / created / skipped in the user's existing Wiki. Does NOT write
 * to the database. The corresponding apply endpoint is tracked as a follow-up
 * and will reuse the plan shape returned here.
 *
 * POST /api/ingest/graph/run — invoke graph `ingest-planner` (#952): shared
 * research loop + structured ingest plan via ZediChatModel. See route TSDoc below.
 *
 * POST /api/ingest/graph/resume — resume an interrupted `ingest-planner` run
 * (HITL at `human_review_research`) using the same `threadId`.
 *
 * LLM Wiki の ingest フロー。プラン生成までの dry-run エンドポイント。
 * DB への書き込みは行わず、プレビュー用のプラン JSON を返す。
 * apply（実適用）エンドポイントは後続 PR で追加する。
 */
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { sources } from "../schema/sources.js";
import { pageSources } from "../schema/pageSources.js";
import { eq, and } from "drizzle-orm";
import { extractArticleFromUrl } from "../services/articleExtractor.js";
import { validateModelAccessOrThrow } from "../services/aiAccessHelpers.js";
import { callProvider, getProviderApiKeyName } from "../services/aiProviders.js";
import { getUserTier } from "../services/subscriptionService.js";
import { checkUsage, calculateCost, recordUsage } from "../services/usageService.js";
import {
  createIngestLlmDriver,
  buildIngestPlannerPrompt,
  parseIngestPlanResponse,
  IngestPlanParseError,
  type CandidatePage,
} from "../services/ingestPlanner.js";
import { resolveComposeContentLocale } from "../agents/core/composeLocale.js";
import { pages } from "../schema/pages.js";
import { pageContents } from "../schema/pageContents.js";
import { recordActivity } from "../services/activityLogService.js";
import type { AppEnv, AIProviderType } from "../types/index.js";
import { GraphRunner } from "../agents/runner/graphRunner.js";
import { INGEST_PLANNER_GRAPH_ID } from "../agents/graphs/ingest/index.js";
import type { IngestArticleSummary } from "../services/ingestPlanner.js";
import { assertSupportedComposeBackend } from "../agents/core/llm/modelFactory.js";
import { assertComposeBackendReady } from "../agents/core/composeBackendValidation.js";
import { resolveCheckpointerForRun } from "../agents/core/checkpoint/index.js";
import { getRegisteredGraph } from "../agents/registry/graphRegistry.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { ExecutionBackend } from "../agents/core/types/executionBackend.js";

const app = new Hono<AppEnv>();

const INGEST_GRAPH_RECURSION_LIMIT = 60;

/**
 * Map graph runner failures caused by client/input validation to HTTP 4xx.
 */
function httpStatusForGraphFailure(error: string | undefined): 400 | 500 {
  if (!error) return 500;
  const clientish =
    /prepare_ingest|plan_ingest|invalid|required|expected|approvedSourceIds|zod|resume/i.test(
      error,
    );
  return clientish ? 400 : 500;
}

function assertGraphRunArticle(article: IngestArticleSummary): void {
  if (!article.title?.trim() || !article.url?.trim() || typeof article.excerpt !== "string") {
    throw new HTTPException(400, { message: "article { title, url, excerpt } is required" });
  }
}

/**
 * LangGraph `thread_id` scoped per user so shared checkpoint storage cannot collide.
 * 共有 checkpoint 上での thread_id 衝突を防ぐため userId でスコープする。
 */
function scopedIngestGraphThreadId(userId: string, clientThreadId: string): string {
  return `${userId}:${clientThreadId}`;
}

function normalizeGraphCandidates(raw: CandidatePage[] | undefined): CandidatePage[] {
  if (!Array.isArray(raw)) return [];
  const out: CandidatePage[] = [];
  for (const entry of raw) {
    if (typeof entry?.id !== "string" || !entry.id.trim()) continue;
    if (typeof entry.title !== "string") continue;
    if (typeof entry.excerpt !== "string") continue;
    out.push({
      id: entry.id.trim(),
      title: entry.title,
      excerpt: entry.excerpt,
    });
  }
  return out;
}

/**
 * Read `userId` stored in an ingest-planner checkpoint, if any.
 * ingest-planner checkpoint に保存された `userId` を読む（あれば）。
 */
async function readIngestCheckpointUserId(
  threadId: string,
  checkpointer: BaseCheckpointSaver,
): Promise<string | null> {
  const registered = getRegisteredGraph(INGEST_PLANNER_GRAPH_ID);
  if (!registered) return null;
  const graph = registered.factory({ checkpointer }) as {
    getState?: (config: unknown) => Promise<{ values?: Record<string, unknown> } | undefined>;
  };
  if (typeof graph.getState !== "function") return null;
  try {
    const snap = await graph.getState({ configurable: { thread_id: threadId } });
    const owner = snap?.values?.userId;
    return typeof owner === "string" && owner.length > 0 ? owner : null;
  } catch {
    return null;
  }
}

/**
 * Reject cross-user access when reusing a `threadId` tied to another user's checkpoint.
 * 他ユーザーの checkpoint に紐づく `threadId` 再利用を拒否する。
 */
async function assertIngestThreadAccessible(
  threadId: string,
  userId: string,
  checkpointer: BaseCheckpointSaver | false,
): Promise<void> {
  if (checkpointer === false) return;
  const owner = await readIngestCheckpointUserId(threadId, checkpointer);
  if (owner !== null && owner !== userId) {
    throw new HTTPException(403, { message: "threadId is not accessible" });
  }
}

/**
 * True when the ingest-planner checkpoint is halted at a HITL interrupt.
 * ingest-planner が HITL で停止しているか。
 */
async function ingestThreadHasPendingInterrupt(
  threadId: string,
  checkpointer: BaseCheckpointSaver,
): Promise<boolean> {
  const registered = getRegisteredGraph(INGEST_PLANNER_GRAPH_ID);
  if (!registered) return false;
  const graph = registered.factory({ checkpointer }) as {
    getState?: (config: unknown) => Promise<
      | {
          tasks?: Array<{ interrupts?: unknown[] }>;
        }
      | undefined
    >;
  };
  if (typeof graph.getState !== "function") return false;
  try {
    const snap = await graph.getState({ configurable: { thread_id: threadId } });
    const tasks = snap?.tasks;
    if (!Array.isArray(tasks)) return false;
    return tasks.some((t) => Array.isArray(t.interrupts) && t.interrupts.length > 0);
  } catch {
    return false;
  }
}

/**
 * Reject `POST /graph/run` when the thread is waiting on `POST /graph/resume`.
 * 中断済み thread に fresh input を流すと HITL をバイパスするため拒否する。
 */
async function assertIngestThreadReadyForRun(
  threadId: string,
  checkpointer: BaseCheckpointSaver | false,
): Promise<void> {
  if (checkpointer === false) return;
  const owner = await readIngestCheckpointUserId(threadId, checkpointer);
  if (owner === null) return;
  const pending = await ingestThreadHasPendingInterrupt(threadId, checkpointer);
  if (pending) {
    throw new HTTPException(409, {
      message: "Graph is interrupted; use POST /api/ingest/graph/resume",
    });
  }
}

/**
 * リクエストボディ。
 * Request body for POST /api/ingest/plan.
 */
interface IngestPlanRequestBody {
  url?: string;
  provider?: AIProviderType;
  model?: string;
  /** 候補検索で取得する最大ページ数（既定 5、上限 10）。Max candidate pages (default 5, max 10). */
  candidateLimit?: number;
}

/**
 * タイトルから検索キーワードを抽出する（素朴な空白分割 + ノイズ除去）。
 * Pulls keyword tokens from the article title for a coarse candidate search.
 *
 * タイトル末尾のナビゲーション片（" - サイト名"、"｜ブログ名"、"| Site" 等）を
 * 簡易的に取り除き、空白で分割して 2 文字以上のトークンのみを返す。
 * 日本語全角バー「｜」は前後の空白なしで使われることが多いため、whitespace を
 * 要求しないセパレータパターンも併用する。
 *
 * @param title - 抽出対象のタイトル。Title from which to extract keywords.
 * @returns キーワード配列（最大 5 件）。Array of up to 5 keyword tokens.
 */
export function extractTitleKeywords(title: string): string[] {
  // 「タイトル - サイト名」「タイトル｜ブログ名」形式のサイト名を落とす（素朴）
  const separators = /(\s+[-–—|]\s+)|([｜])/u;
  const primary = title.split(separators)[0] ?? title;
  return primary
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 5);
}

/**
 * LIKE で使う特殊文字をエスケープする。
 * Escapes LIKE wildcards so user input cannot widen the match.
 */
function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * ユーザーの既存ページから候補を取得する。
 * Fetches candidate pages from the user's existing wiki.
 *
 * @param params - userId・db・キーワード・最大件数。Params bag.
 * @returns 候補ページ配列。Candidate array.
 */
async function fetchCandidates(params: {
  db: AppEnv["Variables"]["db"];
  userId: string;
  keywords: string[];
  limit: number;
}): Promise<CandidatePage[]> {
  const { db, userId, keywords, limit } = params;
  if (keywords.length === 0) return [];

  const patterns = keywords.map((k) => `%${escapeLike(k)}%`);

  // 動的 OR を drizzle の sql テンプレで組む。タイトル一致を優先する。
  const orClauses = patterns.map((p) => sql`p.title ILIKE ${p} OR pc.content_text ILIKE ${p}`);
  const orExpr = orClauses.reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc} OR ${cur}`));

  const rows = await db.execute<{
    id: string;
    title: string | null;
    content_preview: string | null;
    content_text: string | null;
  }>(sql`
    SELECT p.id, p.title, p.content_preview, LEFT(pc.content_text, 400) AS content_text
    FROM pages p
    LEFT JOIN page_contents pc ON pc.page_id = p.id
    WHERE p.is_deleted = false
      AND p.owner_id = ${userId}
      AND (${orExpr})
    ORDER BY p.updated_at DESC
    LIMIT ${limit}
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled",
    excerpt: (r.content_preview || r.content_text || "").slice(0, 400),
  }));
}

app.post("/plan", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: IngestPlanRequestBody;
  try {
    body = await c.req.json<IngestPlanRequestBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  // --- Input validation (runtime type checks) ---
  if (typeof body.url !== "string" || !body.url.trim()) {
    throw new HTTPException(400, { message: "url is required" });
  }
  const url = body.url.trim();

  if (typeof body.provider !== "string" || typeof body.model !== "string" || !body.model.trim()) {
    throw new HTTPException(400, { message: "provider and model are required" });
  }
  const supportedProviders: AIProviderType[] = ["openai", "anthropic", "google"];
  if (!supportedProviders.includes(body.provider as AIProviderType)) {
    throw new HTTPException(400, { message: `unsupported provider: ${body.provider}` });
  }
  // NOTE: the client-supplied provider is *only* used for input validation /
  // 4xx surfacing. The actual provider used for API key lookup and the
  // upstream call is the one resolved from the DB (modelInfo.provider) below.
  // クライアントの provider は入力バリデーションのみで使用し、実呼び出しは
  // DB 上の modelInfo.provider に統一する。
  const model = body.model.trim();

  const rawLimit = Number(body.candidateLimit ?? 5);
  const candidateLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 10) : 5;

  // --- Model access & usage enforcement (mirrors /api/ai/chat) ---
  // Use the *Throw variant so unknown / tier-gated models surface as 4xx
  // instead of falling through the global handler as 500.
  // 不明モデルや tier 制限を 4xx として返すため Throw 版を使う。
  const tier = await getUserTier(userId, db);
  const modelInfo = await validateModelAccessOrThrow(model, tier, db);
  const usageCheck = await checkUsage(userId, tier, db);
  if (!usageCheck.allowed) {
    throw new HTTPException(429, { message: "Monthly budget exceeded" });
  }

  // API key lookup must use the DB-resolved provider, not the client-supplied one.
  // Otherwise a stale client could pass `provider="google"` with an OpenAI model id
  // and we would load the wrong credential and fail upstream auth.
  // クライアント送信値ではなく DB 解決済みの provider で API キー名を引く。
  // ズレると別プロバイダーの鍵で呼び出して認証失敗する。
  const resolvedProvider = modelInfo.provider as AIProviderType;
  const apiKeyName = getProviderApiKeyName(resolvedProvider);
  const apiKey = process.env[apiKeyName];
  if (!apiKey) {
    throw new HTTPException(503, { message: `API key not configured: ${apiKeyName}` });
  }

  let article;
  try {
    // プランナーが参照する excerpt を広めに取るため previewLength を拡張する。
    article = await extractArticleFromUrl({ url, previewLength: 4000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "extraction failed";
    // URL not allowed / extraction failed は 400 として伝える
    throw new HTTPException(400, { message: msg });
  }

  const keywords = extractTitleKeywords(article.title);
  const candidates = await fetchCandidates({ db, userId, keywords, limit: candidateLimit });

  const llm = createIngestLlmDriver(callProvider, {
    provider: modelInfo.provider as AIProviderType,
    model: modelInfo.apiModelId,
    apiKey,
  });

  // Fetch user's wiki schema page (if any) for prompt injection.
  // ユーザーのスキーマページがあればプロンプトに注入する。
  const [schemaRow] = await db
    .select({ contentText: pageContents.contentText })
    .from(pages)
    .leftJoin(pageContents, eq(pageContents.pageId, pages.id))
    .where(and(eq(pages.ownerId, userId), eq(pages.isSchema, true), eq(pages.isDeleted, false)))
    .limit(1);
  const userSchema = schemaRow?.contentText ?? undefined;

  // Build prompt in the route so we can measure ALL message content for
  // accurate token estimation (system prompt + article + candidates).
  const articleSummary = {
    title: article.title,
    url: article.finalUrl,
    excerpt: article.contentText,
  };
  const messages = buildIngestPlannerPrompt({ article: articleSummary, candidates, userSchema });

  let rawResponse: string;
  try {
    rawResponse = await llm(messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    throw new HTTPException(502, { message: msg });
  }

  // --- Usage recording (sum ALL message content, matching chat.ts:66-68) ---
  const inputTokens = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
  const outputTokens = Math.ceil(rawResponse.length / 4);
  const costUnits = calculateCost(
    { inputTokens, outputTokens },
    modelInfo.inputCostUnits,
    modelInfo.outputCostUnits,
  );
  await recordUsage(
    userId,
    model,
    "ingest_plan",
    { inputTokens, outputTokens },
    costUnits,
    "system",
    db,
  );

  let plan;
  try {
    const validCandidateIds = new Set(candidates.map((c) => c.id));
    plan = parseIngestPlanResponse(rawResponse, { validCandidateIds });
  } catch (err) {
    if (err instanceof IngestPlanParseError) {
      throw new HTTPException(502, {
        message: `LLM returned an invalid plan: ${err.message}`,
      });
    }
    throw err;
  }

  return c.json({
    plan,
    source: {
      url: article.finalUrl,
      title: article.title,
      thumbnailUrl: article.thumbnailUrl,
      contentHash: article.contentHash,
    },
    candidates,
  });
});

/**
 * Request body for `POST /api/ingest/graph/run` (#952).
 */
interface IngestGraphRunBody {
  /** Optional stable thread id for checkpoint resume (defaults to new UUID). */
  threadId?: string;
  backend?: ExecutionBackend;
  article?: IngestArticleSummary;
  candidates?: CandidatePage[];
  userSchema?: string;
  maxIterations?: number;
}

/**
 * Request body for `POST /api/ingest/graph/resume` (#952).
 */
interface IngestGraphResumeBody {
  threadId: string;
  backend?: ExecutionBackend;
  resume: unknown;
}

/**
 * POST /api/ingest/graph/run — LangGraph `ingest-planner` execution (#952).
 *
 * **Integration with `POST /api/ingest/plan` (#595)**
 *
 * - `/plan` remains the URL-first production path: server-side article extraction,
 *   candidate SQL search, and `callProvider` via `ingestPlanner.ts` (no research loop).
 * - `/graph/run` expects the caller to supply `article` + `candidates` (typically the
 *   same shapes `/plan` returns) and runs graph id {@link INGEST_PLANNER_GRAPH_ID}:
 *   `prepare_ingest` → shared P1 research nodes → `plan_ingest` (ZediChatModel).
 * - Both endpoints return the same {@link IngestPlan} JSON shape on success.
 * - Apply persistence stays on `POST /api/ingest/apply` for either path.
 *
 * **Resume**
 *
 * When the graph halts at `human_review_research`, the response includes `threadId`
 * (client-visible id; checkpoint `thread_id` is scoped as `{userId}:{threadId}`).
 * Call `POST /api/ingest/graph/resume` with the same `threadId` and research resume payload
 * (`{ approvedSourceIds, rejectedSourceIds?, note? }`, same as compose research).
 */
app.post("/graph/run", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail") ?? null;
  const db = c.get("db");

  let body: IngestGraphRunBody;
  try {
    body = await c.req.json<IngestGraphRunBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (!body.article) {
    throw new HTTPException(400, { message: "article { title, url, excerpt } is required" });
  }
  assertGraphRunArticle(body.article);

  const candidates = normalizeGraphCandidates(body.candidates);
  const clientThreadId =
    typeof body.threadId === "string" && body.threadId.trim() ? body.threadId.trim() : randomUUID();
  const threadId = scopedIngestGraphThreadId(userId, clientThreadId);

  let backend: ExecutionBackend;
  try {
    backend = assertSupportedComposeBackend(body.backend ?? "zedi_managed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unsupported backend";
    throw new HTTPException(400, { message: msg });
  }

  const tier = await getUserTier(userId, db);
  await assertComposeBackendReady({
    backend,
    graphId: INGEST_PLANNER_GRAPH_ID,
    userId,
    tier,
    db,
  });

  const checkpointer = await resolveCheckpointerForRun();
  await assertIngestThreadAccessible(threadId, userId, checkpointer);
  await assertIngestThreadReadyForRun(threadId, checkpointer);
  const runner = new GraphRunner();
  const result = await runner.invoke(
    {
      graphId: INGEST_PLANNER_GRAPH_ID,
      checkpointer,
      recursionLimit: INGEST_GRAPH_RECURSION_LIMIT,
      context: {
        threadId,
        sessionId: threadId,
        userId,
        userEmail,
        pageId: "",
        graphId: INGEST_PLANNER_GRAPH_ID,
        backend,
        tier,
        db,
        feature: "ingest_graph:run",
        contentLocale: resolveComposeContentLocale(null, c.req.header("accept-language"), "ja"),
      },
    },
    {
      kind: "input",
      value: {
        article: body.article,
        candidates,
        userSchema: body.userSchema ?? null,
        maxIterations: body.maxIterations,
      },
    },
  );

  if (result.status === "failed") {
    const status = httpStatusForGraphFailure(result.error);
    throw new HTTPException(status, { message: result.error ?? "Graph run failed" });
  }

  const output = result.output as
    | {
        ingestPlan?: unknown;
        __interrupt__?: unknown[];
      }
    | undefined;

  return c.json({
    status: result.status,
    threadId: clientThreadId,
    graphId: INGEST_PLANNER_GRAPH_ID,
    plan: output?.ingestPlan ?? null,
    output,
  });
});

/**
 * POST /api/ingest/graph/resume — resume `ingest-planner` after research HITL (#952).
 */
app.post("/graph/resume", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail") ?? null;
  const db = c.get("db");

  let body: IngestGraphResumeBody;
  try {
    body = await c.req.json<IngestGraphResumeBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (typeof body.threadId !== "string" || !body.threadId.trim()) {
    throw new HTTPException(400, { message: "threadId is required" });
  }
  if (!Object.prototype.hasOwnProperty.call(body, "resume")) {
    throw new HTTPException(400, { message: "resume is required" });
  }
  const clientThreadId = body.threadId.trim();
  const threadId = scopedIngestGraphThreadId(userId, clientThreadId);

  let backend: ExecutionBackend;
  try {
    backend = assertSupportedComposeBackend(body.backend ?? "zedi_managed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unsupported backend";
    throw new HTTPException(400, { message: msg });
  }

  const tier = await getUserTier(userId, db);
  await assertComposeBackendReady({
    backend,
    graphId: INGEST_PLANNER_GRAPH_ID,
    userId,
    tier,
    db,
  });

  const checkpointer = await resolveCheckpointerForRun();
  if (checkpointer === false) {
    throw new HTTPException(503, {
      message: "Graph resume requires DATABASE_URL checkpointing",
    });
  }

  await assertIngestThreadAccessible(threadId, userId, checkpointer);
  const runner = new GraphRunner();
  const result = await runner.resume(
    {
      graphId: INGEST_PLANNER_GRAPH_ID,
      checkpointer,
      recursionLimit: INGEST_GRAPH_RECURSION_LIMIT,
      context: {
        threadId,
        sessionId: threadId,
        userId,
        userEmail,
        pageId: "",
        graphId: INGEST_PLANNER_GRAPH_ID,
        backend,
        tier,
        db,
        feature: "ingest_graph:resume",
        contentLocale: resolveComposeContentLocale(null, c.req.header("accept-language"), "ja"),
      },
    },
    body.resume,
  );

  if (result.status === "failed") {
    const status = httpStatusForGraphFailure(result.error);
    throw new HTTPException(status, { message: result.error ?? "Graph resume failed" });
  }

  const output = result.output as { ingestPlan?: unknown } | undefined;

  return c.json({
    status: result.status,
    threadId: clientThreadId,
    graphId: INGEST_PLANNER_GRAPH_ID,
    plan: output?.ingestPlan ?? null,
    output,
  });
});

/**
 * Request body for POST /api/ingest/apply.
 * Ingest プラン適用リクエストボディ。
 */
interface IngestApplyRequestBody {
  /** Source kind: "url" or "conversation". / ソース種別 */
  kind: "url" | "conversation";
  /** Source URL (required when kind="url"). / ソース URL（kind="url" のとき必須） */
  url?: string;
  /** Source title. / ソースタイトル */
  title: string;
  /** Content hash for dedup. / 重複検出用コンテンツハッシュ */
  contentHash?: string;
  /** Short excerpt of the source content. / ソースの要約 */
  excerpt?: string;
  /**
   * Raw conversation JSON (required when kind="conversation").
   * 会話 JSON（kind="conversation" のとき必須）
   */
  conversationJson?: string;
  /** Target page id for "merge" action. / マージ先ページ ID */
  targetPageId?: string;
  /** Section anchor in the target page. / マージ先のセクションアンカー */
  sectionAnchor?: string;
  /** Citation text excerpt. / 引用テキスト */
  citationText?: string;
}

/**
 * POST /api/ingest/apply — Persist a source and link it to a page.
 * ソースを保存し、ページに紐付ける。
 */
app.post("/apply", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  let body: IngestApplyRequestBody;
  try {
    body = await c.req.json<IngestApplyRequestBody>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (!body.kind || !["url", "conversation"].includes(body.kind)) {
    throw new HTTPException(400, { message: "kind must be 'url' or 'conversation'" });
  }
  if (!body.title || typeof body.title !== "string") {
    throw new HTTPException(400, { message: "title is required" });
  }
  if (body.kind === "url" && (typeof body.url !== "string" || !body.url.trim())) {
    throw new HTTPException(400, { message: "url is required when kind is 'url'" });
  }
  if (
    body.kind === "conversation" &&
    (typeof body.conversationJson !== "string" || !body.conversationJson.trim())
  ) {
    throw new HTTPException(400, {
      message: "conversationJson is required when kind is 'conversation'",
    });
  }

  // Verify ownership of the target page before any write to prevent cross-user linking.
  // クロスユーザーリンクを防ぐため、書き込み前に targetPageId のオーナー権を検証する。
  if (body.targetPageId) {
    const [targetPage] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(
        and(eq(pages.id, body.targetPageId), eq(pages.ownerId, userId), eq(pages.isDeleted, false)),
      )
      .limit(1);
    if (!targetPage) {
      throw new HTTPException(403, { message: "Target page not found or not owned by user" });
    }
  }

  const now = new Date();

  // Reuse existing source if an identical (owner, url, hash) row already exists; otherwise insert.
  // 同一 (owner, url, hash) のソースが既にあれば再利用、無ければ作成する。
  let sourceId: string | undefined;
  if (body.contentHash) {
    const [existing] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.ownerId, userId),
          eq(sources.contentHash, body.contentHash),
          body.url ? eq(sources.url, body.url) : eq(sources.kind, body.kind),
        ),
      )
      .limit(1);
    if (existing) sourceId = existing.id;
  }

  if (!sourceId) {
    // 上の preflight SELECT と本 INSERT の間に同一ペアが他リクエストから入ると、
    // `uq_sources_owner_url_hash` (partial unique on owner_id+url+content_hash)
    // で 1 つは衝突して 500 か重複行が発生する。`onConflictDoNothing` で衝突時は
    // 何もしない返却にしてから、勝者の行を再 SELECT して採用する。
    // Race-safe insert: pre-flight SELECT then INSERT can lose to a concurrent
    // request and trip the partial unique index. ON CONFLICT DO NOTHING + re-SELECT
    // converges on the winner without raising 500 / leaving a duplicate.
    const [inserted] = await db
      .insert(sources)
      .values({
        ownerId: userId,
        kind: body.kind,
        url: body.url ?? null,
        title: body.title,
        contentHash: body.contentHash ?? null,
        excerpt: body.excerpt ?? body.conversationJson?.slice(0, 400) ?? null,
        extractedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: sources.id });

    if (inserted) {
      sourceId = inserted.id;
    } else if (body.contentHash) {
      const [winner] = await db
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.ownerId, userId),
            eq(sources.contentHash, body.contentHash),
            body.url ? eq(sources.url, body.url) : eq(sources.kind, body.kind),
          ),
        )
        .limit(1);
      if (!winner) {
        throw new HTTPException(500, { message: "Failed to create source" });
      }
      sourceId = winner.id;
    } else {
      throw new HTTPException(500, { message: "Failed to create source" });
    }
  }

  // Link source to page (ownership already verified above).
  if (body.targetPageId) {
    await db
      .insert(pageSources)
      .values({
        pageId: body.targetPageId,
        sourceId,
        sectionAnchor: body.sectionAnchor ?? "",
        citationText: body.citationText ?? null,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // Record the ingest action in activity_log.
  // Chat promotion reuses this endpoint with kind="conversation"; branch the
  // activity kind so the UI can distinguish "clip" vs "chat→wiki" flows.
  // Chat → Wiki 昇格経路は本エンドポイントを kind="conversation" で再利用する。
  // 活動ログ側の種別もそれに合わせて切り替える。
  await recordActivity(db, {
    ownerId: userId,
    kind: body.kind === "conversation" ? "chat_promote" : "clip_ingest",
    actor: "user",
    targetPageIds: body.targetPageId ? [body.targetPageId] : [],
    detail: {
      sourceId,
      sourceKind: body.kind,
      title: body.title,
      url: body.url ?? null,
    },
  });

  return c.json({ sourceId, targetPageId: body.targetPageId ?? null });
});

export default app;
