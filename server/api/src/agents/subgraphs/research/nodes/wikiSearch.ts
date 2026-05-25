/**
 * `wiki_search` node — runs the `wikiSearchTool` for each query whose channels
 * include "wiki", returning internal page hits with stable `wiki:<pageId>` ids.
 *
 * wiki チャンネル指定のクエリごとに `wikiSearchTool` を並列実行する。
 * `GraphContext.userId` から所有・受諾済みメンバー・ドメインルールで絞り込む
 * のは tool 内部で済んでいる（`wikiSearchService.searchUserWikiPages`）。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { wikiSearchTool } from "../../../core/tools/wikiSearch.js";
import type { ResearchLoopStateType, ResearchLoopStateUpdate } from "../state.js";
import type { Source } from "../types.js";

interface WikiSearchToolEnvelope {
  ok: boolean;
  results?: Array<{
    id: string;
    kind: "wiki";
    title: string;
    pageId: string;
    noteId: string;
    snippet?: string;
  }>;
}

/**
 * `wiki_search` node — fans out the `wikiSearchTool` over every query whose
 * `channels` include "wiki". Authorisation (own / accepted-member / domain
 * rule) is enforced inside the tool via `searchUserWikiPages`, scoped by
 * `GraphContext.userId` + `userEmail`.
 *
 * wiki 検索ノード本体。wiki チャンネル指定のクエリごとに `wikiSearchTool` を
 * 並列実行し、内部ページのヒットを `pendingSources` にマージする。
 *
 * @param state  Current research-loop state.
 * @param config LangGraph runnable config (tool invocation requires it so
 *               `GraphContext` can flow to the tool).
 * @returns Partial state update: `{ pendingSources: collectedRows[] }`.
 */
export async function wikiSearch(
  state: ResearchLoopStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchLoopStateUpdate> {
  const targets = state.queries.filter((q) => q.channels.includes("wiki"));
  if (targets.length === 0) return { pendingSources: [] };

  const settled = await Promise.allSettled(
    targets.map((q) => wikiSearchTool.invoke({ query: q.query, limit: 5 }, config)),
  );
  const collected: Source[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    const raw = r.value;
    if (typeof raw !== "string") continue;
    let envelope: WikiSearchToolEnvelope;
    try {
      envelope = JSON.parse(raw) as WikiSearchToolEnvelope;
    } catch {
      continue;
    }
    if (!envelope.ok || !envelope.results) continue;
    for (const hit of envelope.results) {
      collected.push({
        id: hit.id,
        kind: "wiki",
        title: hit.title,
        pageId: hit.pageId,
        noteId: hit.noteId,
        snippet: hit.snippet,
      });
    }
  }
  return { pendingSources: collected };
}
