#!/usr/bin/env node
/**
 * Browser smoke test of the PoC features against a local `wrangler dev`:
 * virtual list, ⌘K palette, editor sync, `#tag`, `[[WikiLink]]`, `/` commands,
 * two-client collaboration and AI streaming. Run `bun run build` first.
 * PoC の主要機能をブラウザで一通り確認するスモークテスト。
 */
import assert from "node:assert/strict";
import { launchBrowser, startWorker } from "./lib/harness.mjs";

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;

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

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await check("virtual list renders only the visible rows", async () => {
    await page.goto(`${BASE}/notes`);
    await page.waitForSelector(".note-row");
    const rows = await page.locator(".note-row").count();
    assert.ok(rows > 0 && rows < 50, `rows in DOM: ${rows}`);
  });

  await check("⌘K palette filters and navigates to a page", async () => {
    await page.keyboard.press("Control+k");
    await page.waitForSelector("dialog.palette[open]");
    await page.keyboard.type("Hono");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/notes\/note-\d+$/);
    await page.waitForSelector("[data-status=synced]", { timeout: 10_000 });
  });

  await check("#tag, [[WikiLink]] and / commands work in the editor", async () => {
    // Rooms persist in .wrangler state between runs, so start from an empty document.
    await page.evaluate(() => window.__zediPoc.editor.commands.clearContent());
    await page.locator(".prose").click();
    await page.keyboard.type("メモ #zedi ");
    await page.keyboard.type("[[Hono");
    await page.waitForSelector(".suggestion-popup .suggestion-option");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/h1");
    await page.waitForSelector(".suggestion-popup .suggestion-option");
    await page.keyboard.press("Enter");
    await page.keyboard.type("見出し");
    assert.equal(await page.locator(".prose span.tag").first().textContent(), "#zedi");
    assert.match(await page.locator(".prose .wiki-chip").first().textContent(), /Hono/);
    assert.equal(await page.locator(".prose h1").first().textContent(), "見出し");
  });

  await check("edits sync between two clients through the Durable Object", async () => {
    const other = await browser.newPage();
    await other.goto(page.url());
    await other.waitForSelector("[data-status=synced]", { timeout: 10_000 });
    assert.match(await other.locator(".prose").textContent(), /見出し/);
    await other.locator(".prose h1").click();
    await other.keyboard.press("End");
    await other.keyboard.type("-from-other");
    await page.waitForFunction(() =>
      document.querySelector(".prose")?.textContent.includes("-from-other"),
    );
    await other.close();
  });

  for (const strategy of ["direct", "blocks", "state"]) {
    await check(`AI streaming renders every token (${strategy})`, async () => {
      await page.goto(`${BASE}/ai?tokens=300&interval=1&strategy=${strategy}`);
      await page.click("[data-testid=ai-start]");
      await page.waitForFunction(() => window.__zediPoc?.aiDone === true, null, {
        timeout: 30_000,
      });
      assert.equal(await page.evaluate(() => window.__zediPoc.aiTokens), 300);
      assert.ok((await page.locator("[data-testid=ai-output]").textContent()).length > 300);
    });
  }

  await check("no uncaught page errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  worker.kill();
}
