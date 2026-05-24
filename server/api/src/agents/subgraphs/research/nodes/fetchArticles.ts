/**
 * `fetch_articles` node — Readability-extracts the top web URLs from
 * `pendingSources` into excerpts and upgrades each source's `kind` from
 * `web` to `fetched` IN PLACE via the id-keyed reducer.
 *
 * Web 検索結果のうち URL を持つ上位 N 件 (既定 5) を `fetchArticleTool` で取得。
 * SSRF / fetch 失敗時は `{ ok:false }` を返すだけで throw しないため、1 件の
 * 失敗で iteration が止まらない。
 *
 * In-place upgrade contract (codex review #956 / gemini #4):
 * - web rows mint id = `src:<sha256(originalUrl)>` (in `webSearch.ts`).
 * - fetched rows reuse that SAME id (carry the source row's `id` over) so the
 *   reducer overwrites the web row with the fetched row in place. The
 *   redirect-resolved URL goes to `finalUrl`; `url` stays equal to the
 *   original so id derivation remains stable across iterations.
 * - Failed fetches leave the web row untouched; a future iteration may retry.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { fetchArticleTool } from "../../../core/tools/fetchArticle.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
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
  // Only fetch `web` rows. `fetched` rows share the same id (`src:<sha>`) so
  // any web hit already promoted in a prior iteration has been overwritten by
  // the reducer and is no longer present as `kind:"web"`.
  // web 行のみ対象。同 URL の fetched 行は同じ id を持つため、過去 iteration で
  // 昇格済みのものは reducer が上書きしており、ここでは現れない。
  const candidates = state.pendingSources
    .filter((s) => s.kind === "web" && typeof s.url === "string" && s.url.length > 0)
    .slice(0, PER_ITERATION_FETCH_LIMIT);

  if (candidates.length === 0) return { pendingSources: [] };

  const settled = await Promise.allSettled(
    candidates.map((s) =>
      fetchArticleTool.invoke({ url: s.url as string, previewLength: 4000 }, config),
    ),
  );

  const upgraded: Source[] = [];
  const fetchedAt = new Date().toISOString();
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (!r || r.status !== "fulfilled") continue;
    const candidate = candidates[i];
    if (!candidate) continue;
    const raw = r.value;
    if (typeof raw !== "string") continue;
    let envelope: FetchArticleSuccess | FetchArticleFailure;
    try {
      envelope = JSON.parse(raw) as FetchArticleSuccess | FetchArticleFailure;
    } catch {
      continue;
    }
    if (!envelope.ok) continue;
    // Carry the candidate's id over so the reducer upgrades the row in place.
    // `url` stays equal to the original; the redirect-resolved URL is stored
    // separately on `finalUrl` (codex review #956 P2).
    // candidate.id を引き継いで reducer に in-place 昇格させる。url は元のまま、
    // リダイレクト後は finalUrl に。
    upgraded.push({
      id: candidate.id,
      kind: "fetched",
      title: envelope.title,
      url: candidate.url,
      finalUrl: envelope.finalUrl,
      excerpt: envelope.excerpt,
      contentHash: envelope.contentHash,
      fetchedAt,
    });
  }
  return { pendingSources: upgraded };
}
