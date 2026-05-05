/**
 * Unit tests for the auto-issue helpers (Epic #616 Phase 3 / Issue #808).
 *
 * 実行方法 / How to run:
 *   `node --test .github/actions/claude-analyze/__tests__/autoIssue.test.mjs`
 *
 * 純粋関数（severity ゲート / ラベル生成 / 検索クエリ生成 / Issue 本文ビルダー）と、
 * `fetch` を差し替えた `runAutoIssue` の経路分岐をカバーする。実 GitHub API は
 * 叩かない（fetch スタブを注入する）。
 *
 * Covers the pure helpers (severity gate, label string, search query, body
 * builders) plus the `runAutoIssue` orchestrator with an injected `fetch` stub.
 * No real GitHub API calls — the HTTP boundary is mocked end-to-end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STATIC_LABELS,
  buildIssueBody,
  buildIssueTitle,
  buildRecurrenceCommentBody,
  buildSentryIssueLabel,
  ensureLabel,
  parseRepository,
  runAutoIssue,
  shouldFileIssue,
} from "../autoIssue.mjs";

test("STATIC_LABELS includes monitoring and auto-reported in deterministic order", () => {
  assert.deepEqual(STATIC_LABELS, ["monitoring", "auto-reported"]);
});

test("shouldFileIssue is true for high and medium only", () => {
  assert.equal(shouldFileIssue("high"), true);
  assert.equal(shouldFileIssue("medium"), true);
  assert.equal(shouldFileIssue("low"), false);
  assert.equal(shouldFileIssue("unknown"), false);
  assert.equal(shouldFileIssue(""), false);
  assert.equal(shouldFileIssue(undefined), false);
});

test("buildSentryIssueLabel prefixes with sentry-issue:", () => {
  assert.equal(buildSentryIssueLabel("abc-123"), "sentry-issue:abc-123");
});

test("buildSentryIssueLabel rejects empty / non-string ids", () => {
  assert.throws(() => buildSentryIssueLabel(""), /non-empty string/);
  assert.throws(() => buildSentryIssueLabel(undefined), /non-empty string/);
  assert.throws(() => buildSentryIssueLabel(42), /non-empty string/);
});

test("parseRepository splits owner/repo and rejects malformed values", () => {
  assert.deepEqual(parseRepository("otomatty/zedi"), { owner: "otomatty", repo: "zedi" });
  assert.throws(() => parseRepository(""), /owner\/repo/);
  assert.throws(() => parseRepository("only-one"), /owner\/repo/);
  assert.throws(() => parseRepository("a/b/c"), /owner\/repo/);
});

test("buildIssueTitle prefixes severity, includes sentry id, and trims long titles", () => {
  const title = buildIssueTitle({
    severity: "high",
    title: "TypeError: Cannot read property 'note_id' of null",
    sentryIssueId: "fixture-1",
  });
  assert.match(title, /^\[high\]/);
  assert.match(title, /TypeError/);
  assert.match(title, /\(sentry:fixture-1\)$/);
});

test("buildIssueTitle truncates titles longer than the cap and falls back to placeholder", () => {
  const long = "x".repeat(500);
  const title = buildIssueTitle({ severity: "medium", title: long, sentryIssueId: "fixture-2" });
  // 256 は GitHub の Issue タイトル上限。本実装は body 部分を 180 で打ち切るので
  // prefix `[medium] ` (10) + 180 + suffix ` (sentry:fixture-2)` (19) = 209 で
  // 256 未満に収まる。回帰検知のためには 256 上限を assert すれば十分。
  // GitHub caps Issue titles at 256 chars; we slice the body at 180 so the
  // total stays under 256 even with prefix/suffix overhead. Asserting the
  // 256 ceiling is sufficient regression coverage.
  assert.ok(title.length <= 256, `expected ≤256 chars, got ${title.length}`);
  // 入力の `x` が 200 個以上残っていないこと（= 中で切られていること）を確認。
  // Confirm truncation actually happened (not just under the GitHub limit).
  const xCount = (title.match(/x/g) ?? []).length;
  assert.ok(xCount < 500, `expected truncation, ${xCount} 'x' chars remained`);
  // 末尾に省略記号があり、切り捨てが視覚的に分かること。
  // Truncated titles should end with `...` so readers see at a glance that
  // the title was cut.
  assert.match(title, /\.\.\. \(sentry:fixture-2\)$/);

  // 上限ちょうど (TITLE_BODY_MAX) なら省略記号は付かない。
  // A title exactly at the cap should NOT receive the ellipsis.
  const exactCap = "y".repeat(180);
  const exactTitle = buildIssueTitle({
    severity: "high",
    title: exactCap,
    sentryIssueId: "fixture-cap",
  });
  assert.ok(!/\.\.\./.test(exactTitle), "no ellipsis when title length is exactly the cap");

  const placeholder = buildIssueTitle({ severity: "high", title: "", sentryIssueId: "fixture-3" });
  assert.match(placeholder, /\(no title\)/);
});

test("buildIssueBody includes AI fields and the sentry id but no Sentry URL", () => {
  const body = buildIssueBody({
    severity: "high",
    summary: "Database migration failed mid-flight.",
    rootCause: "Migration 0042 added NOT NULL without backfill.",
    suggestedFix: "Backfill then re-apply.",
    suspectedFiles: [
      { path: "server/api/drizzle/0042_add_note_id.sql", reason: "Introduced NOT NULL." },
      { path: "server/api/src/services/pageService.ts", line: 42 },
    ],
    route: "POST /api/pages",
    sentryIssueId: "fixture-1",
    apiErrorId: "00000000-0000-0000-0000-000000000001",
    workflowRunUrl: "https://github.com/otomatty/zedi/actions/runs/123",
  });
  assert.match(body, /Severity\s*\|\s*`high`/);
  assert.match(body, /sentry_issue_id.*fixture-1/);
  assert.match(body, /api_error_id.*00000000-0000-0000-0000-000000000001/);
  assert.match(body, /Database migration failed mid-flight\./);
  assert.match(body, /Migration 0042 added NOT NULL without backfill\./);
  assert.match(body, /server\/api\/drizzle\/0042_add_note_id\.sql/);
  assert.match(body, /actions\/runs\/123/);
  // PII 防衛: Sentry URL は本文に含めない（`sentry-issue:` ラベルと id のみで参照可能）。
  // PII guard: do not embed a Sentry URL — the `sentry-issue:` label and id
  // alone are enough to cross-reference, and including the URL would leak the
  // org / project slug into a public-by-default Issue body.
  assert.ok(!/sentry\.io/.test(body), "Sentry URL must not appear in the issue body");
});

test("buildIssueBody escapes pipe characters in table cells so Markdown tables stay intact", () => {
  // route に `|` が混入した場合 (例えば proxy 由来の奇妙なルート文字列など) でも
  // 表組みが崩れないこと。エスケープ後は `\|` として表示される。
  // A `|` in the route (or any inline-rendered field) must be escaped to
  // `\|` so the Markdown table doesn't get split into extra columns.
  const body = buildIssueBody({
    severity: "medium",
    summary: "summary",
    rootCause: null,
    suggestedFix: null,
    suspectedFiles: null,
    route: "GET /api/foo|bar",
    sentryIssueId: "fixture-pipe",
    apiErrorId: "id",
    workflowRunUrl: "https://example.invalid/run/1",
  });
  assert.match(body, /GET \/api\/foo\\\|bar/);
});

test("buildIssueBody handles missing optional fields without showing 'null'", () => {
  const body = buildIssueBody({
    severity: "medium",
    summary: "Transient blip.",
    rootCause: null,
    suggestedFix: null,
    suspectedFiles: null,
    route: "",
    sentryIssueId: "fixture-2",
    apiErrorId: "00000000-0000-0000-0000-000000000002",
    workflowRunUrl: "https://github.com/otomatty/zedi/actions/runs/124",
  });
  assert.ok(!/null/.test(body), "raw 'null' should not appear in the body");
  assert.match(body, /Transient blip\./);
});

test("buildRecurrenceCommentBody references the workflow run and severity", () => {
  const body = buildRecurrenceCommentBody({
    severity: "high",
    summary: "Same migration crash hit again.",
    apiErrorId: "00000000-0000-0000-0000-000000000003",
    workflowRunUrl: "https://github.com/otomatty/zedi/actions/runs/200",
  });
  assert.match(body, /Recurrence detected/i);
  assert.match(body, /high/);
  assert.match(body, /Same migration crash hit again\./);
  assert.match(body, /actions\/runs\/200/);
  assert.match(body, /00000000-0000-0000-0000-000000000003/);
  assert.ok(!/sentry\.io/.test(body), "Sentry URL must not appear in the recurrence comment");
});

/**
 * fetch スタブ。`{ method, url, body }` を順に記録し、登録した応答を返す。
 * Mock fetch that records every call and returns scripted responses by URL+method.
 *
 * @param {Array<{ match: (url: string, init: { method?: string }) => boolean, status: number, json?: unknown }>} responses
 */
function makeFetchStub(responses) {
  const calls = [];
  /**
   * @param {string} url
   * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [init]
   */
  async function fetchImpl(url, init = {}) {
    calls.push({ url, method: init.method ?? "GET", body: init.body });
    const match = responses.find((r) => r.match(url, init));
    if (!match) {
      throw new Error(`Unexpected fetch call: ${init.method ?? "GET"} ${url}`);
    }
    return {
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      async json() {
        return match.json ?? {};
      },
      async text() {
        return JSON.stringify(match.json ?? {});
      },
    };
  }
  return { fetchImpl, calls };
}

test("runAutoIssue skips entirely when severity is low", async () => {
  const { fetchImpl, calls } = makeFetchStub([]);
  const result = await runAutoIssue({
    analysis: { severity: "low", ai_summary: "noop" },
    sentryIssueId: "fixture-low",
    apiErrorId: "id",
    title: "noop",
    route: "",
    repository: "otomatty/zedi",
    token: "tok",
    workflowRunUrl: "https://example.invalid/run/1",
    fetchImpl,
  });
  assert.deepEqual(result, { action: "skipped", reason: "severity-not-actionable" });
  assert.equal(calls.length, 0, "no GitHub API calls should be made for low severity");
});

test("runAutoIssue skips when severity is unknown", async () => {
  const { fetchImpl, calls } = makeFetchStub([]);
  const result = await runAutoIssue({
    analysis: { severity: "unknown", ai_summary: "no clue" },
    sentryIssueId: "fixture-unknown",
    apiErrorId: "id",
    title: "?",
    route: "",
    repository: "otomatty/zedi",
    token: "tok",
    workflowRunUrl: "https://example.invalid/run/2",
    fetchImpl,
  });
  assert.equal(result.action, "skipped");
  assert.equal(calls.length, 0);
});

test("runAutoIssue creates a new issue when no existing match is found", async () => {
  const responses = [
    // ensure label: monitoring (exists)
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/monitoring"),
      status: 200,
      json: { name: "monitoring" },
    },
    // ensure label: auto-reported (missing → create)
    { match: (u, i) => i.method === "GET" && u.endsWith("/labels/auto-reported"), status: 404 },
    {
      match: (u, i) => i.method === "POST" && u.endsWith("/labels"),
      status: 201,
      json: { name: "auto-reported" },
    },
    // ensure label: sentry-issue:fixture-create (missing → create)
    { match: (u, i) => i.method === "GET" && /\/labels\/sentry-issue/.test(u), status: 404 },
    // search → no existing issue
    { match: (u, i) => i.method === "GET" && u.includes("/issues?"), status: 200, json: [] },
    // create issue
    {
      match: (u, i) => i.method === "POST" && u.endsWith("/issues"),
      status: 201,
      json: { number: 999, html_url: "https://github.com/otomatty/zedi/issues/999" },
    },
  ];
  const labelCreates = [];
  // 2 つ目のラベル作成（sentry-issue:...) のレスポンスを上書き経路として追加。
  // POST /labels の 2 回目（sentry-issue: ラベル作成）は同じ matcher で 2 件目に
  // hit させたいので、レスポンス配列を順番消費する形に拡張する。
  let labelPostCount = 0;
  /** @type {ReturnType<typeof makeFetchStub>} */
  const stub = makeFetchStub([
    ...responses.filter(
      (r) => !(r.match.toString().includes('endsWith("/labels")') && r.status === 201),
    ),
  ]);
  // 上の filter で削った POST /labels を、複数回応答可能なエントリで挿入する。
  // Inject a multi-call POST /labels handler so both `auto-reported` and the
  // dynamic `sentry-issue:<id>` label creations succeed.
  const originalFetch = stub.fetchImpl;
  /**
   * @param {string} url
   * @param {{ method?: string, body?: string, headers?: Record<string, string> }} [init]
   */
  stub.fetchImpl = async (url, init = {}) => {
    if (init.method === "POST" && url.endsWith("/labels")) {
      labelPostCount += 1;
      labelCreates.push(JSON.parse(init.body ?? "{}"));
      return {
        ok: true,
        status: 201,
        async json() {
          return { name: labelCreates[labelCreates.length - 1].name };
        },
        async text() {
          return "{}";
        },
      };
    }
    return originalFetch(url, init);
  };

  const result = await runAutoIssue({
    analysis: {
      severity: "high",
      ai_summary: "DB migration crash.",
      ai_root_cause: "NOT NULL without backfill.",
      ai_suggested_fix: "Backfill first.",
      ai_suspected_files: [{ path: "server/api/drizzle/0042.sql" }],
    },
    sentryIssueId: "fixture-create",
    apiErrorId: "00000000-0000-0000-0000-000000000010",
    title: "TypeError: Cannot read property 'note_id' of null",
    route: "POST /api/pages",
    repository: "otomatty/zedi",
    token: "tok",
    workflowRunUrl: "https://github.com/otomatty/zedi/actions/runs/300",
    fetchImpl: stub.fetchImpl,
  });

  assert.equal(result.action, "created");
  assert.equal(result.issueNumber, 999);
  // auto-reported と sentry-issue:fixture-create の 2 ラベルを作成しているはず。
  assert.equal(labelPostCount, 2, "both missing labels should be created");
  assert.deepEqual(labelCreates.map((l) => l.name).sort(), [
    "auto-reported",
    "sentry-issue:fixture-create",
  ]);
  // 作成 POST /issues に高 severity のラベル群が乗っているか。
  const createCall = stub.calls.find((c) => c.method === "POST" && c.url.endsWith("/issues"));
  assert.ok(createCall, "issue create call should be present");
  const createPayload = JSON.parse(createCall.body ?? "{}");
  assert.deepEqual(createPayload.labels.sort(), [
    "auto-reported",
    "monitoring",
    "sentry-issue:fixture-create",
  ]);
  assert.match(createPayload.title, /^\[high\] TypeError/);
});

test("runAutoIssue comments on the existing issue when one is already open", async () => {
  let labelPostCount = 0;
  const responses = [
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/monitoring"),
      status: 200,
      json: { name: "monitoring" },
    },
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/auto-reported"),
      status: 200,
      json: { name: "auto-reported" },
    },
    {
      match: (u, i) => i.method === "GET" && /\/labels\/sentry-issue/.test(u),
      status: 200,
      json: { name: "sentry-issue:fixture-recur" },
    },
    {
      match: (u, i) => i.method === "GET" && u.includes("/issues?"),
      status: 200,
      json: [{ number: 555, html_url: "https://github.com/otomatty/zedi/issues/555" }],
    },
    {
      match: (u, i) => i.method === "POST" && /\/issues\/555\/comments$/.test(u),
      status: 201,
      json: { id: 7777, html_url: "https://github.com/otomatty/zedi/issues/555#issuecomment-7777" },
    },
  ];
  const { fetchImpl, calls } = makeFetchStub(
    responses.concat([
      // POST /labels が呼ばれてしまった場合は失敗にして、未作成パスを保証する。
      // Trip the test if the orchestrator tries to create labels that already exist.
      {
        match: (u, i) => {
          if (i.method === "POST" && u.endsWith("/labels")) {
            labelPostCount += 1;
            throw new Error("must not create existing label");
          }
          return false;
        },
        status: 0,
      },
    ]),
  );

  const result = await runAutoIssue({
    analysis: {
      severity: "medium",
      ai_summary: "Same crash again.",
    },
    sentryIssueId: "fixture-recur",
    apiErrorId: "00000000-0000-0000-0000-000000000020",
    title: "TypeError: ...",
    route: "POST /api/pages",
    repository: "otomatty/zedi",
    token: "tok",
    workflowRunUrl: "https://github.com/otomatty/zedi/actions/runs/400",
    fetchImpl,
  });

  assert.equal(result.action, "commented");
  assert.equal(result.issueNumber, 555);
  assert.equal(labelPostCount, 0, "no labels should be created when all already exist");
  // 検索クエリは sentry-issue:<id> ラベル + state=open。
  const searchCall = calls.find((c) => c.url.includes("/issues?"));
  assert.ok(searchCall, "search call should be present");
  assert.match(searchCall.url, /labels=sentry-issue%3Afixture-recur/);
  assert.match(searchCall.url, /state=open/);
  // コメント本文に「再発」が含まれている。
  const commentCall = calls.find((c) => c.method === "POST" && /\/comments$/.test(c.url));
  assert.ok(commentCall);
  const commentBody = JSON.parse(commentCall.body ?? "{}").body;
  assert.match(commentBody, /Recurrence detected/i);
  assert.match(commentBody, /Same crash again\./);
});

test("runAutoIssue picks the lowest-numbered open issue when multiple match (defensive)", async () => {
  const responses = [
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/monitoring"),
      status: 200,
      json: {},
    },
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/auto-reported"),
      status: 200,
      json: {},
    },
    {
      match: (u, i) => i.method === "GET" && /\/labels\/sentry-issue/.test(u),
      status: 200,
      json: {},
    },
    {
      match: (u, i) => i.method === "GET" && u.includes("/issues?"),
      status: 200,
      // 故意に降順で返す。実装側は number 昇順で最古を選ぶこと。
      json: [
        { number: 900, html_url: "https://github.com/otomatty/zedi/issues/900" },
        { number: 100, html_url: "https://github.com/otomatty/zedi/issues/100" },
      ],
    },
    {
      match: (u, i) => i.method === "POST" && /\/issues\/100\/comments$/.test(u),
      status: 201,
      json: { id: 1, html_url: "x" },
    },
  ];
  const { fetchImpl } = makeFetchStub(responses);

  const result = await runAutoIssue({
    analysis: { severity: "high", ai_summary: "..." },
    sentryIssueId: "fixture-multi",
    apiErrorId: "id",
    title: "t",
    route: "",
    repository: "otomatty/zedi",
    token: "tok",
    workflowRunUrl: "https://example.invalid/run/x",
    fetchImpl,
  });

  assert.equal(result.action, "commented");
  assert.equal(result.issueNumber, 100);
});

test("ensureLabel tolerates 422 from POST /labels (race when another run created the label)", async () => {
  // GET → 404 (未存在), POST → 422 (別 run が直前に作成) のシナリオ。
  // throw せず "existing" を返すこと。
  // GET → 404 (missing), POST → 422 (created by a concurrent run between our
  // GET and POST). The function should not throw and should report
  // "existing" so the caller treats it as success.
  const responses = [
    {
      match: (u, i) => i.method === "GET" && u.endsWith("/labels/auto-reported"),
      status: 404,
    },
    { match: (u, i) => i.method === "POST" && u.endsWith("/labels"), status: 422 },
  ];
  const { fetchImpl } = makeFetchStub(responses);
  const outcome = await ensureLabel({
    owner: "otomatty",
    repo: "zedi",
    label: "auto-reported",
    token: "tok",
    fetchImpl,
    logger: { log: () => {} },
  });
  assert.equal(outcome, "existing");
});

test("ensureLabel returns 'existing' immediately when GET succeeds (no POST issued)", async () => {
  let postCount = 0;
  /**
   * @param {string} url
   * @param {{ method?: string }} init
   */
  async function fetchImpl(url, init = {}) {
    if (init.method === "GET") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { name: "monitoring" };
        },
        async text() {
          return "{}";
        },
      };
    }
    postCount += 1;
    throw new Error("POST should not be called");
  }
  const outcome = await ensureLabel({
    owner: "otomatty",
    repo: "zedi",
    label: "monitoring",
    token: "tok",
    fetchImpl,
    logger: { log: () => {} },
  });
  assert.equal(outcome, "existing");
  assert.equal(postCount, 0);
});
