import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import {
  runAllLintRules,
  getUnresolvedFindings,
  getFindingsForPage,
  resolveFinding,
} from "../services/lintEngine/index.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

app.use("*", authRequired);

/**
 * POST /api/lint/run
 * 全 Lint ルールを実行し、結果を保存して返す。
 * Runs all lint rules, persists results, and returns them.
 */
app.post("/run", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const results = await runAllLintRules(userId, db);

  const summary = results.map((r) => ({
    rule: r.rule,
    count: r.findings.length,
  }));

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);

  return c.json({ summary, total: totalFindings });
});

/**
 * GET /api/lint/findings
 * 未解決の Lint findings を取得する。
 * Fetches unresolved lint findings.
 */
app.get("/findings", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const findings = await getUnresolvedFindings(userId, db);

  return c.json({
    findings: findings.map((f) => ({
      id: f.id,
      rule: f.rule,
      severity: f.severity,
      page_ids: f.pageIds,
      detail: f.detail,
      created_at: f.createdAt.toISOString(),
    })),
    total: findings.length,
  });
});

/**
 * GET /api/lint/findings/page/:pageId
 * 指定ページに関連する未解決 Lint findings を取得する。
 * Fetches unresolved lint findings related to a specific page.
 */
app.get("/findings/page/:pageId", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const pageId = c.req.param("pageId");

  const findings = await getFindingsForPage(userId, pageId, db);

  return c.json({
    findings: findings.map((f) => ({
      id: f.id,
      rule: f.rule,
      severity: f.severity,
      page_ids: f.pageIds,
      detail: f.detail,
      created_at: f.createdAt.toISOString(),
    })),
    total: findings.length,
  });
});

/**
 * POST /api/lint/findings/:id/resolve
 * Lint finding を解決済みにマークする。
 * Marks a lint finding as resolved.
 */
app.post("/findings/:id/resolve", async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const findingId = c.req.param("id");

  const updated = await resolveFinding(findingId, userId, db);
  if (!updated) {
    throw new HTTPException(404, { message: "Finding not found" });
  }

  return c.json({
    finding: {
      id: updated.id,
      rule: updated.rule,
      severity: updated.severity,
      page_ids: updated.pageIds,
      detail: updated.detail,
      resolved_at: updated.resolvedAt?.toISOString() ?? null,
      created_at: updated.createdAt.toISOString(),
    },
  });
});

export default app;
