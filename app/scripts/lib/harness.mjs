/**
 * Shared helpers for the browser scripts: start `wrangler dev` (the app and the test IdP) on a
 * fresh local D1, sign in through the test IdP, and launch Chromium.
 * ブラウザ系スクリプト共通: 空の D1 でアプリとテスト用 IdP を起動、テスト用 IdP でサインイン、Chromium 起動。
 */
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const root = join(import.meta.dirname, "../..");

/**
 * Applies the D1 migrations to a fresh persistence directory and starts `wrangler dev` on
 * `port` with the app (serving the built `dist/client`) and the test IdP behind its
 * `TEST_IDP` binding. Resolves when the server is ready.
 * 新しい保存先に D1 マイグレーションを適用し、アプリとテスト用 IdP を `wrangler dev` で起動する（事前に build が必要）。
 */
export function startWorker(port) {
  const persistTo = join(root, ".wrangler/runs", `${port}-${Date.now()}`);
  mkdirSync(persistTo, { recursive: true });
  execFileSync(
    "bunx",
    ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  const child = spawn(
    "bunx",
    [
      "wrangler",
      "dev",
      "-c",
      "wrangler.jsonc",
      "-c",
      "wrangler.test-idp.jsonc",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      "0",
      "--persist-to",
      persistTo,
      // The measurement scripts seed pages, whatever `.dev.vars` says.
      "--var",
      "ENVIRONMENT:development",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`wrangler dev did not start:\n${log}`));
    }, 60_000);
    const onData = (chunk) => {
      log += String(chunk);
      if (log.includes("Ready on")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`wrangler dev exited (${code}):\n${log}`)));
  });
}

/**
 * The test IdP's password: `TEST_IDP_PASSWORD` from the environment, else from `.dev.vars`
 * (CI copies `.dev.vars.example`).
 * テスト用 IdP のパスワード。環境変数、なければ `.dev.vars` から読む。
 */
export function testIdpPassword() {
  if (process.env.TEST_IDP_PASSWORD) return process.env.TEST_IDP_PASSWORD;
  const vars = readFileSync(join(root, ".dev.vars"), "utf8");
  const line = vars.split("\n").find((l) => l.startsWith("TEST_IDP_PASSWORD="));
  if (!line) throw new Error("TEST_IDP_PASSWORD is not set (copy .dev.vars.example to .dev.vars)");
  return line.slice("TEST_IDP_PASSWORD=".length).trim();
}

/** Applies a response's Set-Cookie headers to a cookie jar (empty values delete). */
function storeCookies(jar, res) {
  for (const header of res.headers.getSetCookie()) {
    const pair = header.split(";")[0];
    const index = pair.indexOf("=");
    const value = pair.slice(index + 1);
    if (value === "" || /max-age=0/i.test(header)) jar.delete(pair.slice(0, index));
    else jar.set(pair.slice(0, index), value);
  }
}

const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

/** Authenticator apps the scripts registered: secret and last used 30-second step, by e-mail. */
const authenticators = new Map();

/** Remembers the authenticator app registered for `email` (its secret, as shown or returned). */
export function rememberAuthenticator(email, secret, step = Math.floor(Date.now() / 30_000)) {
  authenticators.set(email, { secret: secret.replace(/\s+/g, ""), lastStep: step });
}

/**
 * The next code of `email`'s authenticator app that has not been used yet (codes are single
 * use, so this waits for the next 30-second step when the current one is spent).
 * まだ使っていない認証アプリのコードを返す（使用済みなら次の 30 秒まで待つ）。
 */
export async function nextTotpCode(email) {
  const app = authenticators.get(email);
  if (!app) throw new Error(`no authenticator app registered for ${email}`);
  let step = Math.floor(Date.now() / 30_000);
  if (step <= app.lastStep) {
    await sleep((app.lastStep + 1) * 30_000 - Date.now() + 50);
    step = app.lastStep + 1;
  }
  app.lastStep = step;
  return createOTP(base32.decode(app.secret)).hotp(step);
}

/** The code shown right now for a secret (enrollment uses it before it is remembered). */
export function totpCodeNow(secret) {
  return createOTP(base32.decode(secret.replace(/\s+/g, ""))).hotp(Math.floor(Date.now() / 30_000));
}

async function postSecondFactor(base, jar, path, body) {
  const res = await fetch(`${base}/api/second-factor${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, cookie: cookieHeader(jar) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`second factor ${path} failed: ${res.status}`);
  storeCookies(jar, res);
  return res.json();
}

/**
 * Signs in through the real OAuth flow against the test IdP (start → IdP sign-in form →
 * callback), then passes the second factor: registers an authenticator app the first time
 * and enters its next code afterwards. Returns the Cookie header value. `email` must be
 * `@test.zedi-note.app`.
 * テスト用 IdP でサインインし、2 段階目も済ませて Cookie ヘッダー値を返す（初回は認証アプリを登録）。
 */
export async function signInViaApi(base, email) {
  const jar = new Map();
  const start = await fetch(`${base}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ provider: "test-idp", callbackURL: "/notes" }),
  });
  if (!start.ok) throw new Error(`sign-in start failed: ${start.status}`);
  storeCookies(jar, start);
  const { url } = await start.json();
  const authorize = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: testIdpPassword() }).toString(),
    redirect: "manual",
  });
  if (authorize.status !== 302) throw new Error(`test IdP sign-in failed: ${authorize.status}`);
  const callback = await fetch(authorize.headers.get("location"), {
    headers: { cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  storeCookies(jar, callback);
  if (!cookieHeader(jar).includes("session_token")) {
    throw new Error("no session cookie after the callback");
  }
  if (authenticators.has(email)) {
    await postSecondFactor(base, jar, "/totp/verify", { code: await nextTotpCode(email) });
  } else {
    const { secret } = await postSecondFactor(base, jar, "/totp/enrollment", {});
    const step = Math.floor(Date.now() / 30_000);
    await postSecondFactor(base, jar, "/totp/enrollment/confirm", {
      code: await totpCodeNow(secret),
    });
    rememberAuthenticator(email, secret, step);
  }
  return cookieHeader(jar);
}

/** Copies a Cookie header value into a Playwright browser context. */
export async function addSessionCookies(context, base, cookieHeader) {
  const { hostname } = new URL(base);
  await context.addCookies(
    cookieHeader.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return {
        name: pair.slice(0, index),
        value: pair.slice(index + 1),
        domain: hostname,
        path: "/",
      };
    }),
  );
}

/**
 * Launches headless Chromium. `CHROMIUM_PATH` reuses an existing browser binary when the
 * resolved Playwright version has no matching download (`npx playwright install chromium`).
 * ヘッドレス Chromium を起動する。`CHROMIUM_PATH` で既存のブラウザを使える。
 */
export function launchBrowser() {
  const { chromium } = require("playwright");
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}
