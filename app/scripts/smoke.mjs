#!/usr/bin/env node
/**
 * Browser smoke test against a local `wrangler dev` with a fresh D1:
 * sign-in through the test IdP in the UI, page creation, editor sync, `#tag` / `[[WikiLink]]` /
 * `/` commands, D1 projection + full-text search, infinite list, access control between
 * two users (404 → viewer, read-only), AI streaming, offline use through the service worker
 * (app shell, cached list, local page copies, pages created offline) and sign-out.
 * Run `bun run build` first.
 * 空の D1 に対して、サインインから共有・検索・サインアウトまでをブラウザで確認するスモークテスト。
 */
import assert from "node:assert/strict";
import {
  addSessionCookies,
  launchBrowser,
  signInViaApi,
  startWorker,
  testIdpPassword,
} from "./lib/harness.mjs";

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;
const OWNER = `owner-${Date.now()}@test.zedi-note.app`;
const GUEST = `guest-${Date.now()}@test.zedi-note.app`;

const worker = await startWorker(PORT);
const browser = await launchBrowser();
const errors = [];
const check = (name, fn) =>
  fn().then(
    () => console.log(`ok   ${name}`),
    (error) => {
      console.log(`FAIL ${name}: ${error.message}`);
      process.exitCode = 1;
    },
  );
const apiFrom = (page, path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const res = await fetch(p, i);
      return {
        status: res.status,
        body: res.status === 204 ? null : await res.json().catch(() => null),
      };
    },
    [path, init],
  );

try {
  const ownerContext = await browser.newContext();
  const page = await ownerContext.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  let pageUrl = "";

  await check("unauthenticated visit shows the sign-in page and the API answers 401", async () => {
    await page.goto(`${BASE}/notes`);
    await page.waitForSelector("[data-testid=sign-in-test-idp]");
    assert.equal((await apiFrom(page, "/api/me")).status, 401);
  });

  await check("test IdP sign-in through the UI lands on the notes list", async () => {
    await page.click("[data-testid=sign-in-test-idp]");
    await page.waitForSelector("[data-testid=test-idp-email]");
    await page.fill("[data-testid=test-idp-email]", OWNER);
    await page.fill("[data-testid=test-idp-password]", testIdpPassword());
    await page.click("[data-testid=test-idp-submit]");
    await page.waitForSelector("[data-testid=account-email]");
    assert.equal(await page.locator("[data-testid=account-email]").textContent(), OWNER);
    assert.match(await page.locator(".notes h1").textContent(), /0 件/);
  });

  await check("creating a page opens the editor connected to its Durable Object", async () => {
    await page.click("[data-testid=new-page]");
    await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
    await page.waitForSelector("[data-status=synced]", { timeout: 10_000 });
    pageUrl = page.url();
  });

  await check("#tag, [[WikiLink]] and / commands work in the editor", async () => {
    await page.locator(".prose").click();
    await page.keyboard.type("スモーク検証用の本文 #zedi ");
    await page.keyboard.type("[[");
    await page.waitForSelector(".suggestion-popup .suggestion-option");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/h1");
    await page.waitForSelector(".suggestion-popup .suggestion-option");
    await page.keyboard.press("Enter");
    await page.keyboard.type("見出し");
    assert.equal(await page.locator(".prose span.tag").first().textContent(), "#zedi");
    assert.equal(await page.locator(".prose .wiki-chip").count(), 1);
    assert.equal(await page.locator(".prose h1").first().textContent(), "見出し");
  });

  await check("another tab of the same page sees the remote caret (shared carets)", async () => {
    const other = await ownerContext.newPage();
    await other.goto(pageUrl);
    await other.waitForSelector("[data-status=synced]", { timeout: 10_000 });
    await other.locator(".prose h1").click();
    await other.keyboard.press("End");
    await page.waitForSelector(".prose .collaboration-carets__caret", { timeout: 5_000 });
    await other.close();
  });

  await check(
    "edited text is projected to D1 and found by full-text search in the palette",
    async () => {
      await page.waitForTimeout(2_500); // PageRoom saves with a 2 s debounce
      await page.keyboard.press("Control+k");
      await page.waitForSelector("dialog.palette[open]");
      await page.keyboard.type("スモーク検証");
      await page.waitForSelector(".palette-option");
      assert.equal(await page.locator(".palette-option").count(), 1);
      await page.keyboard.press("Escape");
    },
  );

  await check("the list loads more pages from D1 while scrolling (keyset pagination)", async () => {
    const seeded = await apiFrom(page, "/api/dev/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 300 }),
    });
    assert.equal(seeded.body.inserted, 300);
    await page.goto(`${BASE}/notes`);
    await page.waitForSelector(".note-row");
    assert.match(await page.locator(".notes h1").textContent(), /301 件/);
    const listRequests = [];
    page.on("request", (r) => r.url().includes("/pages?limit=") && listRequests.push(r.url()));
    await page
      .locator("[data-testid=note-scroll]")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(500);
    await page
      .locator("[data-testid=note-scroll]")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(500);
    assert.ok(listRequests.length >= 1, "expected follow-up page requests");
    assert.ok(listRequests.every((u) => u.includes("cursor=")));
  });

  await check("on a phone-sized screen the list and the editor get most of the width", async () => {
    const phone = await ownerContext.newPage();
    await phone.setViewportSize({ width: 375, height: 800 });
    await phone.goto(`${BASE}/notes`);
    await phone.waitForSelector(".note-row");
    const listWidth = await phone
      .locator("[data-testid=note-scroll]")
      .evaluate((el) => el.clientWidth);
    assert.ok(listWidth >= 320, `list is ${listWidth}px wide at 375px`);
    await phone.goto(pageUrl);
    await phone.waitForSelector(".ProseMirror");
    const editorWidth = await phone.locator(".ProseMirror").evaluate((el) => el.clientWidth);
    assert.ok(editorWidth >= 280, `editor is ${editorWidth}px wide at 375px`);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    await phone.close();
  });

  await check("another user gets 404 until shared, then sees the page read-only", async () => {
    const guestContext = await browser.newContext();
    await addSessionCookies(guestContext, BASE, await signInViaApi(BASE, GUEST));
    const guest = await guestContext.newPage();
    guest.on("pageerror", (e) => errors.push(e.message));
    await guest.goto(pageUrl);
    await guest.waitForSelector("text=ページが見つかりません。");

    const { body } = await apiFrom(page, "/api/me");
    const share = await apiFrom(page, `/api/notes/${body.defaultNoteId}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: GUEST, role: "viewer" }),
    });
    assert.equal(share.status, 204);

    await guest.goto(pageUrl);
    await guest.waitForSelector("[data-status=synced]", { timeout: 10_000 });
    assert.match(await guest.locator("[data-testid=sync-status]").textContent(), /閲覧のみ/);
    assert.match(await guest.locator(".prose").textContent(), /スモーク検証用の本文/);
    assert.equal(await guest.locator(".prose").getAttribute("contenteditable"), "false");
    await guestContext.close();
  });

  await check("AI streaming works for a signed-in user", async () => {
    await page.goto(`${BASE}/ai?tokens=300&interval=1&strategy=blocks`);
    await page.click("[data-testid=ai-start]");
    await page.waitForFunction(() => window.__zediApp?.aiDone === true, null, { timeout: 30_000 });
    assert.equal(await page.evaluate(() => window.__zediApp.aiTokens), 300);
  });

  await check("streaming Markdown renders headings, lists, code and tables", async () => {
    await page.goto(`${BASE}/ai?tokens=600&interval=1&strategy=md-blocks`);
    await page.click("[data-testid=ai-start]");
    await page.waitForFunction(() => window.__zediApp?.aiDone === true, null, { timeout: 30_000 });
    const output = page.locator("[data-testid=ai-output]");
    for (const selector of ["h2", "ul li", "pre code.language-ts", "table th", "blockquote"]) {
      assert.ok((await output.locator(selector).count()) > 0, `missing ${selector}`);
    }
    assert.equal(await output.locator(".md-live").count(), 0);
  });

  await check("the service worker controls the app after the first visit", async () => {
    await page.goto(`${BASE}/notes`);
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
      timeout: 10_000,
    });
    // Visit the page and the list once online so their data is on the device.
    await page.goto(pageUrl);
    await page.waitForSelector("[data-status=synced]", { timeout: 10_000 });
    await page.goto(`${BASE}/notes`);
    await page.waitForSelector(".note-row");
  });

  let offlinePageUrl = "";
  await check("offline, the list and a visited page reopen from the device", async () => {
    await ownerContext.setOffline(true);
    await page.goto(`${BASE}/notes`);
    await page.waitForSelector("[data-testid=offline-banner]");
    await page.waitForSelector(".note-row");
    assert.match(await page.locator(".notes h1").textContent(), /301 件/);
    assert.equal(await page.getByRole("button", { name: "サインアウト" }).isDisabled(), true);
    await page.goto(pageUrl);
    await page.waitForFunction(
      () => document.querySelector(".prose")?.textContent.includes("スモーク検証用の本文"),
      null,
      { timeout: 10_000 },
    );
    assert.equal(
      await page.locator("[data-testid=sync-status]").getAttribute("data-status"),
      "offline",
    );
  });

  await check(
    "offline, a new page can be written, is listed as unsynced and is searchable",
    async () => {
      await page.goto(`${BASE}/notes`);
      await page.click("[data-testid=new-page]");
      await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
      await page.waitForSelector("[data-status=local]");
      offlinePageUrl = page.url();
      await page.locator(".prose").click();
      await page.keyboard.type("オフラインで書いた本文");
      await page.waitForTimeout(300);
      await page.click(".sidebar a[href='/notes']");
      await page.waitForSelector(".note-row .badge");
      assert.match(await page.locator(".notes h1").textContent(), /302 件/);
      await page.keyboard.press("Control+k");
      await page.waitForSelector("dialog.palette[open]");
      await page.keyboard.type("新しいページ");
      await page.waitForSelector(".palette-option");
      await page.keyboard.press("Escape");
    },
  );

  await check(
    "back online, the page is created and the offline text reaches the server",
    async () => {
      await ownerContext.setOffline(false);
      const id = offlinePageUrl.split("/").at(-1);
      await page.waitForFunction(
        async (pageId) => (await fetch(`/api/pages/${pageId}`)).status === 200,
        id,
        { polling: 250, timeout: 10_000 },
      );
      await page.waitForFunction(() => !document.querySelector(".note-row .badge"));
      // Opening the page connects it; Y.js merges the local copy into the Durable Object.
      await page.goto(offlinePageUrl);
      await page.waitForSelector("[data-status=synced]", { timeout: 10_000 });
      // A fresh browser has no local copy, so it can only see the text through the server.
      const fresh = await browser.newContext();
      await fresh.addCookies(await ownerContext.cookies());
      const other = await fresh.newPage();
      await other.goto(offlinePageUrl);
      await other.waitForSelector("[data-status=synced]", { timeout: 10_000 });
      await other.waitForFunction(
        () => document.querySelector(".prose")?.textContent.includes("オフラインで書いた本文"),
        null,
        { timeout: 10_000 },
      );
      await fresh.close();
    },
  );

  await check("sign-out returns to the sign-in page and revokes API access", async () => {
    await page.goto(`${BASE}/notes`);
    await page.getByRole("button", { name: "サインアウト" }).click();
    await page.waitForSelector("[data-testid=sign-in-test-idp]");
    assert.equal((await apiFrom(page, "/api/me")).status, 401);
  });

  await check("sign-out removes cached API data and local page copies", async () => {
    const left = await page.evaluate(async () => ({
      caches: (await caches.keys()).filter((n) => n.startsWith("zedi-api-")),
      databases: (await indexedDB.databases())
        .map((db) => db.name)
        .filter((n) => n?.startsWith("zedi:page:")),
    }));
    assert.deepEqual(left, { caches: [], databases: [] });
  });

  await check("no uncaught page errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  worker.kill();
}
