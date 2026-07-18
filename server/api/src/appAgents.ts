import type { Hono } from "hono";
import type { AppEnv } from "./types/index.js";

import composeSessionRoutes from "./routes/composeSessions.js";
import ingestRoutes from "./routes/ingest.js";
import { registerStubGraph } from "./agents/registry/stubGraph.js";
import { registerResearchLoopGraph } from "./agents/subgraphs/research/index.js";
import { registerWikiComposeGraph } from "./agents/graphs/wikiCompose/index.js";
import { registerIngestPlannerGraph } from "./agents/graphs/ingest/index.js";
import { registerWikiMaintenanceGraph } from "./agents/graphs/wikiMaintenance/index.js";

/**
 * LangGraph 依存のルート・graph 登録をまとめて行う（Node エントリ専用）。
 * Worker バンドルから `@langchain/*` / `src/agents/**` を除外するため、
 * このモジュールは `index.ts` だけが import する（worker.ts は import 禁止 —
 * `worker:bundle:check` が不在を検査する）。#1091 FR-1。
 */
export function registerAgentRoutes(app: Hono<AppEnv>): void {
  // Wiki Compose graphs を registry に登録する。いずれも idempotent。
  // - `wiki-compose-stub` — P0 smoke test (#948)
  // - `wiki-compose-research` — P1 自律調査ループ (#949)
  // - `wiki-compose` — P2 全体オーケストレータ (#950)
  // - `ingest-planner` — P4 ingest + shared research loop (#952)
  // - `wiki-maintenance` — P5 broken links + stub scan (#953)
  //
  // Register all Wiki Compose graphs. Calls are idempotent across hot
  // reloads (registry uses `Map#set` so the latest registration wins).
  registerStubGraph();
  registerResearchLoopGraph();
  registerWikiComposeGraph();
  registerIngestPlannerGraph();
  registerWikiMaintenanceGraph();

  // Wiki Compose sessions (LangGraph runs) — issue #948.
  // `/api/pages/:pageId/compose-sessions[/:id[/run|/resume]]`
  app.route("/api/pages", composeSessionRoutes);

  // Ingest (LLM Wiki pattern, P1)
  app.route("/api/ingest", ingestRoutes);
}
