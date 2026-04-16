/**
 * /api/ingest — LLM Wiki ingest flow (P1, otomatty/zedi#595).
 *
 * POST /api/ingest/plan — dry-run: given a URL, propose how the article should
 * be merged / created / skipped in the user's existing Wiki. Does NOT write
 * to the database. The corresponding apply endpoint is tracked as a follow-up
 * and will reuse the plan shape returned here.
 *
 * LLM Wiki の ingest フロー。プラン生成までの dry-run エンドポイント。
 * DB への書き込みは行わず、プレビュー用のプラン JSON を返す。
 * apply（実適用）エンドポイントは後続 PR で追加する。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { extractArticleFromUrl } from "../lib/articleExtractor.js";
import { callProvider, getProviderApiKeyName } from "../services/aiProviders.js";
import { getUserTier } from "../services/subscriptionService.js";
import {
  checkUsage,
  validateModelAccess,
  calculateCost,
  recordUsage,
} from "../services/usageService.js";
import {
  createIngestLlmDriver,
  planIngest,
  IngestPlanParseError,
  type CandidatePage,
} from "../services/ingestPlanner.js";
import type { AppEnv, AIProviderType } from "../types/index.js";

const app = new Hono<AppEnv>();

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
  const provider = body.provider as AIProviderType;
  const model = body.model.trim();

  const rawLimit = Number(body.candidateLimit ?? 5);
  const candidateLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 10) : 5;

  // --- Model access & usage enforcement (mirrors /api/ai/chat) ---
  const tier = await getUserTier(userId, db);
  const modelInfo = await validateModelAccess(model, tier, db);
  const usageCheck = await checkUsage(userId, tier, db);
  if (!usageCheck.allowed) {
    throw new HTTPException(429, { message: "Monthly budget exceeded" });
  }

  const apiKeyName = getProviderApiKeyName(provider);
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

  try {
    const plan = await planIngest({
      article: {
        title: article.title,
        url: article.finalUrl,
        // contentText は extractArticleFromUrl で previewLength=4000 に制限済。
        // Planner 側でさらに truncate(4000) されるため二重の上限になる。
        excerpt: article.contentText,
      },
      candidates,
      llm,
    });

    // --- Usage recording (approximate token estimation, same approach as streaming in chat) ---
    const inputTokens = Math.ceil(article.contentText.length / 4);
    const outputTokens = Math.ceil((plan.reason?.length ?? 0) / 4) + 50;
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
  } catch (err) {
    if (err instanceof IngestPlanParseError) {
      throw new HTTPException(502, {
        message: `LLM returned an invalid plan: ${err.message}`,
      });
    }
    throw err;
  }
});

export default app;
