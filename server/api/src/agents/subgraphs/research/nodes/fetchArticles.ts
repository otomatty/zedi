/**
 * `fetch_articles` node — Readability-extracts the top web URLs from
 * `pendingSources` into excerpts and upgrades each source's `kind` from
 * `web` to `fetched` in place (via the id-keyed reducer).
 *
 * Web 検索結果のうち URL を持つ上位 N 件 (既定 5) を `fetchArticleTool` で取得。
 * SSRF / fetch 失敗時は `{ ok:false }` を返すだけで throw しないため、1 件の
 * 失敗で iteration が止まらない。同 id (`fetched:<sha256>`) を返さないので、
 * 元 `web` 行と新 `fetched` 行は別エントリとして並存する（評価ノードは
 * `kind === "fetched"` を優先する想定）。
 *
 * Implementation note: we preserve the original `web:<sha>` row alongside the
 * new `fetched:<sha>` row because they have different ids; `evaluate_sufficiency`
 * already filters duplicates by URL.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createHash } from "node:crypto";
import { fetchArticleTool } from "../../../core/tools/fetchArticle.js";
import type {
  ResearchLoopStateType,
  ResearchLoopStateUpdate,
} from "../state.js";
import type { Source } from "../types.js";

interface FetchArticleSuccess {
  ok: true;
  url: string;
  finalUrl: string;
  title: string;
  excerpt: string;
  contentHash: string;
  thumbnailUrl: string | null;
}

interface FetchArticleFailure {
  ok: false;
  url: string;
  error: string;
}

const PER_ITERATION_FETCH_LIMIT = 5;

export async function fetchArticles(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  // Only fetch `web` rows that have not yet been upgraded to `fetched`.
  const fetchedUrls = new Set(
    state.pendingSources.filter((s) => s.kind === "fetched").map((s) => s.url),
  );
  const candidates = state.pendingSources
    .filter((s) => s.kind === "web" && s.url && !fetchedUrls.has(s.url))
    .slice(0, PER_ITERATION_FETCH_LIMIT);

  if (candidates.length === 0) return { pendingSources: [] };

  const settled = await Promise.allSettled(
    candidates.map((s) =>
      // Non-null asserted: filter above guarantees `url` is defined.
      fetchArticleTool.invoke({ url: s.url as string, previewLength: 4000 }, config),
    ),
  );

  const upgraded: Source[] = [];
  const fetchedAt = new Date().toISOString();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const raw = r.value;
    if (typeof raw !== "string") continue;
    let envelope: FetchArticleSuccess | FetchArticleFailure;
    try {
      envelope = JSON.parse(raw) as FetchArticleSuccess | FetchArticleFailure;
    } catch {
      continue;
    }
    if (!envelope.ok) continue;
    upgraded.push({
      id: `fetched:${sha256Hex(envelope.finalUrl)}`,
      kind: "fetched",
      title: envelope.title,
      url: envelope.finalUrl,
      excerpt: envelope.excerpt,
      contentHash: envelope.contentHash,
      fetchedAt,
    });
  }
  return { pendingSources: upgraded };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
