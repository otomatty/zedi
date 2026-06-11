/**
 * Wiki Compose instant-mode + Understanding Layer E2E.
 *
 * Instant モード（ゲート無し）の挙動を Playwright で固定する。実 LLM / 実 API は
 * 使わず、`/api/pages/.../compose-sessions` 系を `page.route` で全てモックする。
 *
 * Pins the zero-friction path: the user lands on Compose and the article streams
 * straight into the editor with NO Brief / Research / Outline gates, then the
 * Understanding Layer (TL;DR / key terms / self-check) appears. The whole run is
 * a single `POST .../run` SSE stream that ends with a `compose_completion` event
 * followed by `done(completed)` — there is no `PATCH .../resume` round-trip.
 *
 * Wire contract: instant mode never interrupts, so the client must NOT issue a
 * resume; if it did, the mock has no resume route and the catch-all returns 404.
 *
 * waitForTimeout 新規使用禁止。状態ベースの待機のみ使うこと。
 */
import { test, expect } from "./auth-mock";
import type { Page, Route } from "@playwright/test";

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const SECTION_ID = "sec-overview";

const PAGE_SNAPSHOT = {
  pageId: PAGE_ID,
  title: "Photosynthesis",
  body: "",
  hasContent: false,
};

const COMPLETION = {
  markdown: "## Overview\n\nPhotosynthesis converts light energy into chemical energy.",
  sections: [
    {
      sectionId: SECTION_ID,
      heading: "Overview",
      body: "Photosynthesis converts light energy into chemical energy stored in glucose.",
      citedSourceIds: [],
      completedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  citedSources: [],
  completedAt: "2026-01-01T00:00:00.000Z",
  comprehensionAids: {
    summary: "Plants use sunlight to turn water and CO2 into glucose and oxygen.",
    keyTerms: [
      { term: "Chlorophyll", definition: "The green pigment in plants that absorbs light energy." },
    ],
    questions: ["What does photosynthesis convert light energy into?"],
  },
};

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

/** Encode SSE records as `data: <JSON>\n\n`; the JSON carries the `type`. */
function sseBody(records: Array<Record<string, unknown>>): Buffer {
  const parts = records.map((record) => `data: ${JSON.stringify(record)}\n\n`);
  return Buffer.from(new TextEncoder().encode(parts.join("")));
}

/**
 * Instant-run SSE: started → structure phase → section stream → completion →
 * done(completed). No interrupts.
 */
const INSTANT_RUN_RECORDS: Array<Record<string, unknown>> = [
  { type: "started", sessionId: SESSION_ID, graphId: "wiki-compose" },
  { type: "compose_snapshot", pageSnapshot: PAGE_SNAPSHOT },
  { type: "compose_phase", phase: "structure", status: "entered" },
  {
    type: "compose_section",
    sectionId: SECTION_ID,
    heading: "Overview",
    status: "started",
    index: 1,
    total: 1,
  },
  { type: "token", node: "draft_sections", content: "Photosynthesis converts light energy " },
  { type: "token", node: "draft_sections", content: "into chemical energy stored in glucose." },
  {
    type: "compose_section",
    sectionId: SECTION_ID,
    heading: "Overview",
    status: "completed",
    index: 1,
    total: 1,
  },
  { type: "compose_phase", phase: "completed", status: "entered" },
  { type: "compose_completion", completion: COMPLETION },
  { type: "done", status: "completed" },
];

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

/** Install the note/page API mocks needed to render the page view. */
async function installPageViewMocks(page: Page): Promise<void> {
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

/**
 * Install the Compose API mocks (create / get / run). Returns the captured run
 * request bodies so the test can assert the client sends `mode: "instant"`.
 */
async function installComposeMocks(page: Page): Promise<{ runBodies: unknown[] }> {
  let runCount = 0;
  const runBodies: unknown[] = [];

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

  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}`,
    async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session: sessionRow("running"), projection: null }),
        });
        return;
      }
      await route.fallback();
    },
  );

  await page.route(
    (url) => url.pathname === `/api/pages/${PAGE_ID}/compose-sessions/${SESSION_ID}/run`,
    async (route: Route) => {
      runCount += 1;
      runBodies.push(route.request().postDataJSON());
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
        body: sseBody(INSTANT_RUN_RECORDS),
      });
    },
  );

  return { runBodies };
}

test.describe("Wiki Compose instant mode", () => {
  test.setTimeout(60_000);

  test("streams a draft with no gates and shows the Understanding Layer", async ({ page }) => {
    await installPageViewMocks(page);
    const { runBodies } = await installComposeMocks(page);

    await page.goto(`/notes/${NOTE_ID}/${PAGE_ID}/compose`);

    // The real page title is shown (delivered via the early compose_snapshot
    // event, since instant mode has no Brief interrupt to carry it).
    await expect(
      page.getByTestId("compose-editor-pane").getByRole("heading", { level: 1 }),
    ).toContainText("Photosynthesis", { timeout: 10000 });

    // The article body renders directly into the editor — no Brief gate.
    await expect(page.getByTestId(`editor-section-${SECTION_ID}`)).toContainText(
      "Photosynthesis converts light energy",
      { timeout: 10000 },
    );

    // No human-in-the-loop gates were shown.
    await expect(page.getByTestId("submit-brief")).toHaveCount(0);
    await expect(page.getByTestId("research-submit")).toHaveCount(0);
    await expect(page.getByTestId("outline-submit")).toHaveCount(0);

    // Phase stepper reaches "completed".
    await expect(page.getByTestId("phase-step-completed")).toHaveAttribute("aria-current", "step", {
      timeout: 10000,
    });

    // Understanding Layer is present with TL;DR, key terms and self-check.
    const comprehension = page.getByTestId("comprehension-section");
    await expect(comprehension).toBeVisible();
    await expect(page.getByTestId("comprehension-summary")).toContainText("sunlight");
    await expect(page.getByTestId("comprehension-term-0")).toContainText("Chlorophyll");

    // Self-check question is an active-recall toggle.
    const question = page.getByTestId("comprehension-question-0");
    await expect(question).toContainText("What does photosynthesis convert");
    await expect(question).toHaveAttribute("aria-pressed", "false");
    await question.click();
    await expect(question).toHaveAttribute("aria-pressed", "true");

    // Wire contract: the client sent `mode: "instant"` and issued exactly one run.
    expect(runBodies).toHaveLength(1);
    const runBody = runBodies[0] as { input?: { mode?: unknown } };
    expect(runBody?.input?.mode).toBe("instant");
  });
});
