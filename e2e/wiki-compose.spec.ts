/**
 * Wiki Compose P2 happy-path E2E (issue #950).
 *
 * Compose の入口 → brief → 調査確認 → 構成 → 執筆 → 完了の流れを Playwright で
 * 検証する。実 LLM / 実 API は使わず、`page.route` で `/api/pages/.../compose-sessions`
 * 系を全てモックして wire 形式 (SSE) を再生する。
 *
 * Drives the Compose split-screen UI through every interrupt point using a
 * fully mocked SSE stream. Pins both the wire contract (the UI consumes the
 * SSE shapes correctly) and the user-facing happy path without depending on
 * a running API backend with real LLM access.
 *
 * バックエンド無し環境で動くよう、ページビュー到達に必要な note / page 系
 * API も `page.route` でモックする（issue #1036）。
 * Runs without a backend: the note/page APIs needed to reach the page view
 * are mocked via `page.route` as well (issue #1036).
 *
 * waitForTimeout 新規使用禁止（issue #1036）。状態ベースの待機のみ使うこと。
 * Do NOT add new `waitForTimeout` calls (issue #1036). Use state-based waits only.
 */
import { test, expect } from "./auth-mock";
import type { Page, Route } from "@playwright/test";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

const PAGE_SNAPSHOT = {
  pageId: PAGE_ID,
  title: "Photosynthesis",
  body: "",
  hasContent: false,
};

const BRIEF_QUESTION_ID = "qid-1";
const BRIEF_OPTION_ID = "oid-1";
const SOURCE_ID = "src:demo";
const SECTION_ID = "sec-overview";

/**
 * Encode a sequence of SSE-formatted events as a Uint8Array body. Each event
 * gets `event:` + `data:` lines and a blank-line terminator.
 */
function sseBody(events: Array<{ type: string; payload: unknown }>): Uint8Array {
  const parts = events.map(
    ({ type, payload }) => `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
  );
  return new TextEncoder().encode(parts.join(""));
}

let runCount = 0;

/** Per-run event sequences served by the mocked SSE endpoint. */
function eventsForRun(n: number): Array<{ type: string; payload: unknown }> {
  // Run 1: initial run → halt at Brief interrupt.
  // Run 2: after Brief resume → halt at Research interrupt.
  // Run 3: after Research resume → halt at Outline interrupt.
  // Run 4: after Outline resume → stream Draft and complete.
  switch (n) {
    case 1:
      return [
        {
          type: "started",
          payload: { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
        },
        {
          type: "compose_phase",
          payload: { type: "compose_phase", phase: "brief", status: "entered" },
        },
        {
          type: "interrupt",
          payload: {
            type: "interrupt",
            payload: {
              kind: "human_review_brief",
              questions: [
                {
                  id: BRIEF_QUESTION_ID,
                  question: "What's the audience for this article?",
                  rationale: "Helps the agent calibrate depth.",
                  required: false,
                  options: [
                    { id: BRIEF_OPTION_ID, label: "General readers" },
                    { id: "oid-2", label: "Specialists" },
                  ],
                },
              ],
              pageSnapshot: PAGE_SNAPSHOT,
            },
          },
        },
        { type: "done", payload: { type: "done", status: "interrupted" } },
      ];
    case 2:
      return [
        {
          type: "started",
          payload: { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
        },
        {
          type: "compose_phase",
          payload: { type: "compose_phase", phase: "research", status: "entered" },
        },
        {
          type: "interrupt",
          payload: {
            type: "interrupt",
            payload: {
              kind: "human_review_research",
              batch: {
                id: "batch-1",
                iteration: 0,
                queries: [],
                sources: [],
                evaluation: null,
                createdAt: new Date().toISOString(),
              },
              pendingSources: [
                {
                  id: SOURCE_ID,
                  kind: "web",
                  title: "Photosynthesis — Britannica",
                  url: "https://example.com/photosynthesis",
                  snippet: "Photosynthesis converts light energy…",
                },
              ],
            },
          },
        },
        { type: "done", payload: { type: "done", status: "interrupted" } },
      ];
    case 3:
      return [
        {
          type: "started",
          payload: { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
        },
        {
          type: "compose_phase",
          payload: { type: "compose_phase", phase: "structure", status: "entered" },
        },
        {
          type: "interrupt",
          payload: {
            type: "interrupt",
            payload: {
              kind: "human_review_outline",
              outline: [
                {
                  id: SECTION_ID,
                  heading: "Overview",
                  depth: 1,
                  intent: "Brief introduction",
                },
              ],
              approvedSources: [
                {
                  id: SOURCE_ID,
                  kind: "web",
                  title: "Photosynthesis — Britannica",
                  url: "https://example.com/photosynthesis",
                  snippet: "Photosynthesis converts light energy…",
                },
              ],
            },
          },
        },
        { type: "done", payload: { type: "done", status: "interrupted" } },
      ];
    case 4:
      return [
        {
          type: "started",
          payload: { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
        },
        {
          type: "compose_phase",
          payload: { type: "compose_phase", phase: "draft", status: "entered" },
        },
        {
          type: "compose_section",
          payload: {
            type: "compose_section",
            sectionId: SECTION_ID,
            heading: "Overview",
            status: "started",
            index: 1,
            total: 1,
          },
        },
        { type: "token", payload: { type: "token", node: "draft_sections", content: "Photo" } },
        {
          type: "token",
          payload: { type: "token", node: "draft_sections", content: "synthesis." },
        },
        {
          type: "compose_section",
          payload: {
            type: "compose_section",
            sectionId: SECTION_ID,
            heading: "Overview",
            status: "completed",
            index: 1,
            total: 1,
          },
        },
        {
          type: "compose_phase",
          payload: { type: "compose_phase", phase: "completed", status: "entered" },
        },
        { type: "done", payload: { type: "done", status: "completed" } },
      ];
    default:
      return [{ type: "done", payload: { type: "done", status: "completed" } }];
  }
}

/** Wire-format note row for GET /api/notes/:noteId. */
const NOTE_ROW = {
  id: NOTE_ID,
  slug: "compose-note",
  title: "Compose Note",
  description: null,
  visibility: "private",
  owner_id: "local-user",
  current_user_role: "owner",
  page_count: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/** Wire-format page row for GET /api/pages/:pageId. */
const PAGE_ROW = {
  id: PAGE_ID,
  note_id: NOTE_ID,
  owner_id: "local-user",
  title: "Photosynthesis",
  content_preview: "",
  thumbnail_url: null,
  source_url: null,
  is_deleted: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Install the note/page API mocks needed to render the page view without a
 * backend (issue #1036). Must be called BEFORE `installComposeMocks` so the
 * catch-all (registered first) is checked last by Playwright.
 *
 * バックエンド無しでページビューを描画するための note / page 系モック。
 * Playwright は登録の逆順でルートを評価するため、catch-all を最後に評価
 * させるには `installComposeMocks` より先に呼ぶこと。
 */
async function installPageViewMocks(page: Page): Promise<void> {
  // Catch-all for unmocked /api/* → 404. Predicate form so Vite module URLs
  // like /src/lib/api/... are NOT intercepted.
  // 未モックの /api/* は 404。述語形式にして Vite のモジュール URL
  // (/src/lib/api/...) を巻き込まない。
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route: Route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "not_found" }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/notes/${NOTE_ID}`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(NOTE_ROW),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/notes/${NOTE_ID}/pages`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [PAGE_ROW], total: 1 }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PAGE_ROW),
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/public-links`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ outgoing_links: [], backlinks: [], ghost_links: [] }),
      });
    },
  );
}

/** Install the Compose API mocks (create / get / run / resume / cancel). */
async function installComposeMocks(page: Page): Promise<void> {
  runCount = 0;

  // POST /compose-sessions — create.
  await page.route(`**/api/pages/${PAGE_ID}/compose-sessions`, async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          session: {
            id: SESSION_ID,
            pageId: PAGE_ID,
            userId: "user-1",
            graphId: "wiki-compose",
            backend: "zedi_managed",
            phase: "init",
            status: "pending",
            metadata: null,
            lastError: null,
            closedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  // POST /compose-sessions/:id/run — SSE.
  await page.route(
    `**/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}/run`,
    async (route: Route) => {
      runCount += 1;
      const body = sseBody(eventsForRun(runCount));
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: Buffer.from(body),
      });
    },
  );

  // PATCH /compose-sessions/:id/resume.
  await page.route(
    `**/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}/resume`,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "interrupted", output: null }),
      });
    },
  );
}

test.describe("Wiki Compose P2 happy path", () => {
  test.setTimeout(60_000);

  test("walks Brief → Research → Outline → Draft → Completed", async ({ page }) => {
    await installPageViewMocks(page);
    await installComposeMocks(page);

    await page.goto(`/notes/${NOTE_ID}/${PAGE_ID}/compose`);

    // Brief interrupt — question card appears (compose auto-starts from AI settings).
    const briefCard = page.getByTestId(`brief-card-${BRIEF_QUESTION_ID}`);
    await expect(briefCard).toBeVisible();
    await expect(page.getByText("What's the audience for this article?")).toBeVisible();

    // Pick an option and submit.
    await page.getByTestId(`brief-option-${BRIEF_OPTION_ID}`).click();
    await page.getByTestId("submit-brief").click();

    // Research interrupt — source review card appears.
    const sourceRow = page.getByTestId(`source-row-${SOURCE_ID}`);
    await expect(sourceRow).toBeVisible({ timeout: 10000 });

    // Approve all sources and continue.
    await page.getByTestId("research-submit").click();

    // Outline interrupt — outline row appears.
    const outlineRow = page.getByTestId(`outline-row-${SECTION_ID}`);
    await expect(outlineRow).toBeVisible({ timeout: 10000 });

    // Approve outline and continue.
    await page.getByTestId("outline-submit").click();

    // Draft phase — phase stepper advances to completed and the editor pane
    // renders the streamed body.
    await expect(page.getByTestId("phase-step-completed")).toHaveAttribute("aria-current", "step", {
      timeout: 10000,
    });
    await expect(page.getByTestId(`editor-section-${SECTION_ID}`)).toContainText(
      "Photosynthesis.",
      { timeout: 10000 },
    );

    // Back button returns to the page.
    await page.getByTestId("compose-back").click();
    await expect(page).toHaveURL(`/notes/${NOTE_ID}/${PAGE_ID}`);
  });
});
