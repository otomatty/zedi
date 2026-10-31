#!/usr/bin/env node
/**
 * Browser smoke test against a local `wrangler dev` with a fresh D1:
 * sign-in through the test IdP in the UI with the second factor (registering an authenticator
 * app, then its code on the next sign-in; a passkey on Chromium's virtual authenticator, then
 * the passkey on the next sign-in; the security page adding the app, removing the passkey and
 * switching to new recovery codes once saved), page creation, editor sync, `#tag` / `[[WikiLink]]` /
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
  nextTotpCode,
  rememberAuthenticator,
  signInViaApi,
  startWorker,
  testIdpPassword,
  totpCodeNow,
} from "./lib/harness.mjs";

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;
const OWNER = `owner-${Date.now()}@test.zedi-note.app`;
const GUEST = `guest-${Date.now()}@test.zedi-note.app`;
const PASSKEY_USER = `passkey-${Date.now()}@test.zedi-note.app`;
// WebAuthn does not accept an IP address as the relying party, so passkeys run on localhost.
const LOCALHOST = `http://localhost:${PORT}`;

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

  const signInWithTestIdp = async () => {
    await page.click("[data-testid=sign-in-test-idp]");
    await page.waitForSelector("[data-testid=test-idp-email]");
    await page.fill("[data-testid=test-idp-email]", OWNER);
    await page.fill("[data-testid=test-idp-password]", testIdpPassword());
    await page.click("[data-testid=test-idp-submit]");
  };

  await check("test IdP sign-in through the UI asks for a second factor first", async () => {
    await signInWithTestIdp();
    // Passkeys need a host name, so on 127.0.0.1 only the authenticator app is offered.
    await page.waitForSelector("[data-testid=choose-totp]");
    assert.equal(await page.locator("[data-testid=choose-passkey]").count(), 0);
    await page.click("[data-testid=choose-totp]");
    await page.waitForSelector("[data-testid=totp-secret]");
    const qr = page.getByRole("img", { name: "認証アプリ用の QR コード" });
    assert.equal(await qr.count(), 1);
    assert.deepEqual(await apiFrom(page, "/api/me"), {
      status: 403,
      body: { error: "second_factor_required" },
    });
  });

  await check(
    "registering an authenticator app (after saving the recovery codes) opens the notes list",
    async () => {
      assert.equal(await page.locator("[data-testid=recovery-codes] li").count(), 10);
      assert.equal(await page.locator("[data-testid=totp-code-submit]").isDisabled(), true);
      await page.check("[data-testid=recovery-codes-saved]");
      const secret = await page.locator("[data-testid=totp-secret]").textContent();
      await page.fill("[data-testid=totp-code]", await totpCodeNow(secret));
      rememberAuthenticator(OWNER, secret);
      await page.click("[data-testid=totp-code-submit]");
      // No passkey is suggested on 127.0.0.1 (see above); the notes list opens.
      await page.waitForSelector("[data-testid=account-email]");
      assert.equal(await page.locator("[data-testid=account-email]").textContent(), OWNER);
      assert.match(await page.locator(".notes h1").textContent(), /0 件/);
    },
  );

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

  await check("signing in again asks for the authenticator app's code", async () => {
    await signInWithTestIdp();
    await page.waitForSelector("[data-testid=totp-code]");
    assert.equal(await page.locator("[data-testid=totp-secret]").count(), 0);
    await page.fill("[data-testid=totp-code]", await nextTotpCode(OWNER));
    await page.click("[data-testid=totp-code-submit]");
    await page.waitForSelector("[data-testid=account-email]");
    assert.equal(await page.locator("[data-testid=account-email]").textContent(), OWNER);
  });

  // The passkey user's browser, shared by the next two checks.
  const passkeyContext = await browser.newContext();
  try {
    const passkeyPage = await passkeyContext.newPage();
    passkeyPage.on("pageerror", (e) => errors.push(e.message));
    const cdp = await passkeyContext.newCDPSession(passkeyPage);
    const signInHere = async () => {
      await passkeyPage.click("[data-testid=sign-in-test-idp]");
      await passkeyPage.fill("[data-testid=test-idp-email]", PASSKEY_USER);
      await passkeyPage.fill("[data-testid=test-idp-password]", testIdpPassword());
      await passkeyPage.click("[data-testid=test-idp-submit]");
    };
    const signOutHere = async () => {
      await passkeyPage.getByRole("button", { name: "サインアウト" }).click();
      await passkeyPage.waitForSelector("[data-testid=sign-in-test-idp]");
    };

    await check("a passkey is registered first, then used to sign in again", async () => {
      await cdp.send("WebAuthn.enable");
      const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await passkeyPage.goto(`${LOCALHOST}/notes`);
      await signInHere();
      await passkeyPage.click("[data-testid=choose-passkey]");
      await passkeyPage.waitForSelector("[data-testid=recovery-codes]");
      assert.equal(await passkeyPage.locator("[data-testid=recovery-codes] li").count(), 10);
      assert.equal(await passkeyPage.locator("[data-testid=passkey-register]").isDisabled(), true);
      await passkeyPage.check("[data-testid=recovery-codes-saved]");
      await passkeyPage.click("[data-testid=passkey-register]");
      // The authenticator app is suggested next; it can wait.
      await passkeyPage.click("[data-testid=suggest-later]");
      await passkeyPage.waitForSelector("[data-testid=account-email]");
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      assert.equal(credentials.length, 1);
      assert.equal(credentials[0].rpId, "localhost");

      await signOutHere();
      await signInHere();
      await passkeyPage.click("[data-testid=passkey-verify]");
      await passkeyPage.waitForSelector("[data-testid=account-email]");
      assert.equal(
        await passkeyPage.locator("[data-testid=account-email]").textContent(),
        PASSKEY_USER,
      );
    });

    await check(
      "the security page adds an app, then removes the passkey, and makes new recovery codes",
      async () => {
        // Just signed in with the passkey, so changes are allowed without checking again.
        await passkeyPage.getByRole("link", { name: "セキュリティ" }).click();
        const passkeys = passkeyPage.getByRole("list", { name: "登録したパスキー" });
        await passkeys.waitFor();
        assert.equal(new URL(passkeyPage.url()).pathname, "/settings/security");
        assert.equal(await passkeys.locator("li").count(), 1);
        // The only method cannot go.
        assert.equal(await passkeys.getByRole("button").isDisabled(), true);

        await passkeyPage.getByRole("button", { name: "認証アプリを登録" }).click();
        const secret = await passkeyPage.locator("[data-testid=totp-secret]").textContent();
        const step = Math.floor(Date.now() / 30_000);
        await passkeyPage.fill("[data-testid=totp-code]", await totpCodeNow(secret));
        await passkeyPage.click("[data-testid=totp-code-submit]");
        await passkeyPage.getByText("認証アプリ: 登録済み").waitFor();
        rememberAuthenticator(PASSKEY_USER, secret, step);

        await passkeys.getByRole("button").click();
        await passkeyPage.getByRole("button", { name: "削除する" }).click();
        await passkeyPage.getByText("パスキーは登録されていません").waitFor();

        // New codes are shown first and only replace the old ones once saved and switched to.
        await passkeyPage.getByRole("button", { name: "復旧用コードを作り直す" }).click();
        await passkeyPage.waitForSelector("[data-testid=new-recovery-codes] li");
        assert.equal(await passkeyPage.locator("[data-testid=new-recovery-codes] li").count(), 10);
        const switchTo = passkeyPage.getByRole("button", { name: "このコードに切り替える" });
        assert.equal(await switchTo.isDisabled(), true);
        await passkeyPage.check("[data-testid=new-recovery-codes-saved]");
        await switchTo.click();
        await passkeyPage.getByText("前のコードは使えなくなりました").waitFor();
        await passkeyPage.getByText("残り 10 個").waitFor();

        // Without the passkey, the next sign-in asks for the app's code.
        await signOutHere();
        await signInHere();
        await passkeyPage.waitForSelector("[data-testid=totp-code]");
        assert.equal(await passkeyPage.locator("[data-testid=passkey-verify]").count(), 0);
        await passkeyPage.fill("[data-testid=totp-code]", await nextTotpCode(PASSKEY_USER));
        await passkeyPage.click("[data-testid=totp-code-submit]");
        await passkeyPage.waitForSelector("[data-testid=account-email]");
      },
    );
  } finally {
    await passkeyContext.close();
  }

  await check("no uncaught page errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  worker.kill();
}
