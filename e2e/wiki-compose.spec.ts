/**
 * Wiki Compose P2 happy-path E2E (issue #950).
 *
 * Compose の入口 → brief → 調査確認 → 構成 → 完了の流れを Playwright で
 * 検証する。実 LLM / 実 API は使わず、`page.route` で `/api/pages/.../compose-sessions`
 * 系を全てモックする。
 *
 * Drives the Compose split-screen UI through every interrupt point using a
 * fully mocked backend. Pins both the wire contract and the user-facing happy
 * path without depending on a running API backend with real LLM access.
 *
 * Wire contract (spec-extractor confirmed against the server implementation):
 * - SSE is replayed ONLY for the initial `POST .../run`. Each SSE record is a
 *   `data: <JSON>\n\n` line whose JSON carries a mandatory `type` field
 *   (`event:` lines are ignored by the client).
 * - Phase transitions after the first interrupt are driven by the JSON body of
 *   `PATCH .../resume`: `output.__interrupt__` is an ARRAY whose `[0].value`
 *   holds the interrupt payload (discriminated by `value.kind`). The final
 *   resume returns `status: "completed"` with `output.completion` directly —
 *   no Draft token streaming happens on the resume path.
 * - `run` is only legal while the session status is `pending` / `failed`; a
 *   second run against an `interrupted` session gets 409 from the real server,
 *   so the mock answers 409 too (catching contract violations).
 *
 * フェーズ遷移のトリガーは `PATCH .../resume` の JSON 応答ボディであり、
 * SSE は初回 run の 1 回のみ。resume 経路では Draft のトークンストリーミングは
 * 発生せず、outline 承認の応答で直接 Completed に遷移する。
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

/** Source row shared by the research interrupt and the outline approval. */
const DEMO_SOURCE = {
  id: SOURCE_ID,
  kind: "web",
  title: "Photosynthesis — Britannica",
  url: "https://example.com/photosynthesis",
  snippet: "Photosynthesis converts light energy…",
};

/** Outline section shared by the outline interrupt and the final completion. */
const OUTLINE_SECTION = {
  id: SECTION_ID,
  heading: "Overview",
  depth: 1,
  intent: "Brief introduction",
};

/** Wire-format session row (camelCase, wrapped in `{ session }` by callers). */
function sessionRow(status: string): Record<string, unknown> {
  return {
    id: SESSION_ID,
    pageId: PAGE_ID,
    userId: "user-1",
    graphId: "wiki-compose",
    backend: "zedi_managed",
    phase: "init",
    status,
    metadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Encode SSE records as `data: <JSON>\n\n`. The JSON itself must carry the
 * `type` discriminator — `event:` lines are ignored by the client, so we do
 * not emit them.
 *
 * SSE レコードは `data: <JSON>\n\n` 形式。`type` は JSON 内に必須で、
 * `event:` 行はクライアントに無視されるため出力しない。
 */
function sseBody(records: Array<Record<string, unknown>>): Buffer {
  const parts = records.map((record) => `data: ${JSON.stringify(record)}\n\n`);
  return Buffer.from(new TextEncoder().encode(parts.join("")));
}

/** Initial-run SSE: started → Brief interrupt → done(interrupted). */
const INITIAL_RUN_RECORDS: Array<Record<string, unknown>> = [
  { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
  {
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
  { type: "done", status: "interrupted" },
];

/**
 * Resume responses in submission order: Brief → Research interrupt,
 * Research → Outline interrupt, Outline → Completed (with completion payload).
 *
 * `output.__interrupt__` は配列で、`[0].value` に interrupt ペイロード
 * （判別キー `value.kind`）を入れる。最後の resume は completion を直接返す。
 */
const RESUME_RESPONSES: Array<Record<string, unknown>> = [
  // 1) Brief answers submitted → halt at Research interrupt.
  {
    status: "interrupted",
    output: {
      __interrupt__: [
        {
          value: {
            kind: "human_review_research",
            batch: {
              id: "b1",
              iteration: 1,
              sources: [],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            pendingSources: [DEMO_SOURCE],
          },
        },
      ],
    },
  },
  // 2) Research approval submitted → halt at Outline interrupt.
  {
    status: "interrupted",
    output: {
      __interrupt__: [
        {
          value: {
            kind: "human_review_outline",
            outline: [OUTLINE_SECTION],
            approvedSources: [DEMO_SOURCE],
          },
        },
      ],
    },
  },
  // 3) Outline approval submitted → completed with the drafted sections.
  //    No Draft token streaming on the resume path (see header comment).
  {
    status: "completed",
    output: {
      completion: {
        markdown: "## Overview\n\nPhotosynthesis.",
        sections: [
          {
            sectionId: SECTION_ID,
            heading: "Overview",
            body: "Photosynthesis.",
            citedSourceIds: [],
            completedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      approvedOutline: { sections: [OUTLINE_SECTION] },
    },
  },
];

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

/** Install the Compose API mocks (create / get / run / resume). */
async function installComposeMocks(page: Page): Promise<void> {
  let runCount = 0;
  let resumeCount = 0;

  // POST /compose-sessions — create (201, wrapped in { session }).
  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions`,
    async (route: Route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ session: sessionRow("pending") }),
        });
        return;
      }
      await route.fallback();
    },
  );

  // GET /compose-sessions/:id — served on route remount after the URL is
  // replaced to `/compose/:sessionId`. Returning `interrupted` guarantees the
  // client does NOT re-issue `run`.
  // URL が `/compose/:sessionId` に replace された後の再マウントで呼ばれる。
  // `interrupted` を返せば run は再発行されない。
  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}`,
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: sessionRow("interrupted"), projection: null }),
        });
        return;
      }
      await route.fallback();
    },
  );

  // POST /compose-sessions/:id/run — SSE, first call only. The real server
  // rejects run on an `interrupted` session with 409, so any second call is a
  // contract violation and gets the faithful 409.
  // run は初回のみ SSE。`interrupted` 中の再 run は実サーバ同様 409（契約違反検知）。
  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}/run`,
    async (route: Route) => {
      runCount += 1;
      if (runCount > 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "session_not_runnable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: sseBody(INITIAL_RUN_RECORDS),
      });
    },
  );

  // PATCH /compose-sessions/:id/resume — phase transitions are driven by this
  // JSON response body (NOT by replayed SSE).
  // フェーズ遷移はこの JSON 応答ボディで駆動される（SSE 再生ではない）。
  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}/resume`,
    async (route: Route) => {
      const response = RESUME_RESPONSES[resumeCount];
      resumeCount += 1;
      if (!response) {
        // 4th+ resume is a contract violation — fail loudly instead of looping.
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "session_not_resumable" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    },
  );
}

test.describe("Wiki Compose P2 happy path", () => {
  test.setTimeout(60_000);

  test("walks Brief → Research → Outline → Completed", async ({ page }) => {
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

    // Research interrupt — source review card appears (driven by the resume body).
    const sourceRow = page.getByTestId(`source-row-${SOURCE_ID}`);
    await expect(sourceRow).toBeVisible({ timeout: 10000 });

    // Approve all sources and continue.
    await page.getByTestId("research-submit").click();

    // Outline interrupt — outline row appears (driven by the resume body).
    const outlineRow = page.getByTestId(`outline-row-${SECTION_ID}`);
    await expect(outlineRow).toBeVisible({ timeout: 10000 });

    // Approve outline and continue. The final resume responds with
    // `status: "completed"` + completion payload — no Draft token streaming.
    await page.getByTestId("outline-submit").click();

    // Completed — phase stepper advances and the editor pane renders the
    // drafted body from `completion.sections`.
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
