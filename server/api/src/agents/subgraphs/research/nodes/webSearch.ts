/**
 * `web_search` node — runs the `webSearchTool` for each query whose channels
 * include "web". Sources from the tool merge into `pendingSources` via the
 * reducer's id-keyed dedup.
 *
 * web チャンネル指定のクエリごとに `webSearchTool` を並列実行し、結果を
 * `pendingSources` にマージする。tool 側で `{ ok:false }` が返っても throw せず
 * skip するので、1 クエリの失敗が iteration を止めない。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { webSearchTool } from "../../../core/tools/webSearch.js";
import type {
  ResearchLoopStateType,
  ResearchLoopStateUpdate,
} from "../state.js";
import type { Source } from "../types.js";

interface WebSearchToolEnvelope {
  ok: boolean;
  results?: Array<{
    id: string;
    kind: "web";
    title: string;
    url: string;
    snippet?: string;
  }>;
}

export async function webSearch(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const targets = state.queries.filter((q) => q.channels.includes("web"));
  if (targets.length === 0) return { pendingSources: [] };

  const settled = await Promise.allSettled(
    targets.map((q) => webSearchTool.invoke({ query: q.query, limit: 5 }, config)),
  );
  const collected: Source[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const raw = r.value;
    if (typeof raw !== "string") continue;
    let envelope: WebSearchToolEnvelope;
    try {
      envelope = JSON.parse(raw) as WebSearchToolEnvelope;
    } catch {
      continue;
    }
    if (!envelope.ok || !envelope.results) continue;
    for (const hit of envelope.results) {
      collected.push({
        id: hit.id,
        kind: "web",
        title: hit.title,
        url: hit.url,
        snippet: hit.snippet,
      });
    }
  }
  return { pendingSources: collected };
}
