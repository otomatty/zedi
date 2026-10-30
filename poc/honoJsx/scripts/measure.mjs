#!/usr/bin/env node
/**
 * Measurements against a local `wrangler dev` with a fresh D1 seeded with 10,000 pages:
 * API latency and D1 cost (rows read, SQL time) from Node, then runtime metrics in headless
 * Chromium as a signed-in user. Requires Playwright with Chromium (`CHROMIUM_PATH` to reuse one).
 * Run `bun run build` first; this script starts `wrangler dev` itself on port 8788.
 *
 * 1 万ページを投入した D1 に対し、API の遅延と D1 コスト、ブラウザでの実行時性能を計測する。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addSessionCookies, launchBrowser, signInViaApi, startWorker } from "./lib/harness.mjs";

const root = join(import.meta.dirname, "..");
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const CPU_RATES = (process.env.CPU_RATES ?? "1,4").split(",").map(Number);
const SEED_PAGES = Number(process.env.SEED_PAGES ?? 10_000);
let cookie = "";
let noteId = "";

const apiFetch = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, origin: BASE, "content-type": "application/json", ...(init.headers ?? {}) },
  });

async function createPageViaApi(title) {
  const res = await apiFetch(`/api/notes/${noteId}/pages`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return (await res.json()).id;
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const summary = (values) => ({
  n: values.length,
  p50: +percentile(values, 50).toFixed(1),
  p95: +percentile(values, 95).toFixed(1),
  max: +Math.max(...values).toFixed(1),
});

async function newPage(browser, cpuRate) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addSessionCookies(context, BASE, cookie);
  const page = await context.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  return page;
}

/** keydown → next frame, the usual approximation of input-to-paint latency. */
const installLatencyProbe = (page) =>
  page.evaluate(() => {
    window.__lat = [];
    document.addEventListener(
      "keydown",
      () => {
        const t0 = performance.now();
        requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t0), 0));
      },
      { capture: true },
    );
  });

const longTasksBetween = (page, from, to) =>
  page.evaluate(
    ([a, b]) => {
      const tasks = window.__longTasks.filter((t) => t.start >= a && t.start <= b);
      return {
        count: tasks.length,
        totalMs: +tasks.reduce((s, t) => s + t.duration, 0).toFixed(1),
      };
    },
    [from, to],
  );

async function measureNotes(browser, cpuRate) {
  const page = await newPage(browser, cpuRate);
  await page.goto(`${BASE}/notes`);
  await page.waitForFunction(() => performance.getEntriesByName("notes:first-render").length > 0);
  const firstRenderMs = await page.evaluate(
    () => performance.getEntriesByName("notes:first-render")[0].startTime,
  );
  const rowsInDom = await page.locator(".note-row").count();
  let pageRequests = 0;
  page.on("request", (r) => r.url().includes("/pages?limit=") && (pageRequests += 1));
  const scroll = await page.evaluate(async () => {
    const el = document.querySelector("[data-testid=note-scroll]");
    const start = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      const step = () => {
        el.scrollTop += 150;
        frames += 1;
        if (performance.now() - start < 3000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    const seconds = (performance.now() - start) / 1000;
    return { fps: +(frames / seconds).toFixed(1), from: start, to: performance.now() };
  });
  const scrollLongTasks = await longTasksBetween(page, scroll.from, scroll.to);
  const heapMB = await page.evaluate(
    () => +(performance.memory?.usedJSHeapSize / 1048576).toFixed(1),
  );
  const scrolledRows = await page.evaluate(() =>
    Math.round(document.querySelector("[data-testid=note-scroll]").scrollTop / 72),
  );
  await page.close();
  return {
    firstRenderMs: +firstRenderMs.toFixed(1),
    rowsInDom,
    scrollFps: scroll.fps,
    scrollLongTasks,
    scrolledRows,
    pageRequestsWhileScrolling: pageRequests,
    heapMB,
  };
}

async function openEditor(browser, cpuRate, room, query = "") {
  const page = await newPage(browser, cpuRate);
  await page.goto(`${BASE}/notes/${room}${query}`);
  await page.waitForSelector("[data-status=synced]", { timeout: 15_000 });
  return page;
}

async function measureTyping(browser, cpuRate, { paragraphs, collab = true }) {
  const room = await createPageViaApi(`bench ${paragraphs} x${cpuRate}`);
  const page = await openEditor(browser, cpuRate, room, collab ? "" : "?collab=0");
  // Navigation start → lazy editor chunk loaded, editor mounted and Y.js synced.
  const readyMs = await page.evaluate(
    () => performance.getEntriesByName("editor:synced")[0]?.startTime ?? null,
  );
  if (paragraphs > 0) {
    await page.evaluate((count) => {
      const html = Array.from(
        { length: count },
        (_, i) =>
          `<p>段落 ${i + 1}: Zedi の PoC で入力遅延を計測するためのダミー本文です。#tag${i % 10} を含みます。</p>`,
      ).join("");
      window.__zediPoc.editor.commands.setContent(html);
    }, paragraphs);
  }
  await page.locator(".prose").click();
  await page.evaluate(() => window.__zediPoc.editor.commands.focus("end"));
  await installLatencyProbe(page);
  await page.keyboard.type("hono/jsx/dom で入力遅延を計測しています。".repeat(4), { delay: 30 });
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() => window.__lat);
  await page.close();
  return { readyMs: readyMs === null ? null : +readyMs.toFixed(1), latencyMs: summary(samples) };
}

async function measureCollab(browser, cpuRate) {
  const room = await createPageViaApi(`collab x${cpuRate}`);
  const a = await openEditor(browser, cpuRate, room);
  const b = await openEditor(browser, cpuRate, room);
  await a.locator(".prose").click();
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    const marker = `m${i}x`;
    const waitInB = b.waitForFunction(
      (m) => document.querySelector(".prose")?.textContent.includes(m),
      marker,
      {
        polling: "raf",
      },
    );
    const t0 = Date.now();
    await a.keyboard.type(marker);
    await waitInB;
    samples.push(Date.now() - t0);
  }
  await a.close();
  await b.close();
  return summary(samples);
}

async function measureAi(browser, cpuRate, strategy, tokens = 2000) {
  const page = await newPage(browser, cpuRate);
  await page.goto(`${BASE}/ai?tokens=${tokens}&interval=2&strategy=${strategy}`);
  const from = await page.evaluate(() => performance.now());
  await page.evaluate(() => {
    window.__frames = 0;
    const tick = () => {
      window.__frames += 1;
      if (!window.__zediPoc?.aiDone) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click("[data-testid=ai-start]");
  await page.waitForFunction(() => window.__zediPoc?.aiDone === true, null, { timeout: 120_000 });
  const result = await page.evaluate((start) => {
    const seconds = (performance.now() - start) / 1000;
    return {
      seconds: +seconds.toFixed(2),
      fps: +(window.__frames / seconds).toFixed(1),
      tokens: window.__zediPoc.aiTokens,
    };
  }, from);
  const to = await page.evaluate(() => performance.now());
  const longTasks = await longTasksBetween(page, from, to);
  await page.close();
  return { ...result, longTasks };
}

async function timeRequest(path, iterations = 30) {
  const latency = [];
  const d1 = [];
  let rowsRead = 0;
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    const res = await apiFetch(path);
    await res.arrayBuffer();
    latency.push(performance.now() - t0);
    const timing = /d1;dur=([\d.]+)/.exec(res.headers.get("server-timing") ?? "");
    if (timing) d1.push(Number(timing[1]));
    rowsRead = Number(res.headers.get("x-d1-rows-read") ?? 0);
  }
  return { latencyMs: summary(latency), d1SqlMs: d1.length ? summary(d1) : null, rowsRead };
}

async function measureApi() {
  const first = await (await apiFetch(`/api/notes/${noteId}/pages?limit=100`)).json();
  let cursor = first.nextCursor;
  for (let i = 1; i < 50 && cursor; i += 1) {
    cursor = (
      await (await apiFetch(`/api/notes/${noteId}/pages?limit=100&cursor=${cursor}`)).json()
    ).nextCursor;
  }
  const anyPage = first.items[0].id;
  return {
    me: await timeRequest("/api/me"),
    pageDetail: await timeRequest(`/api/pages/${anyPage}`),
    listFirst100: await timeRequest(`/api/notes/${noteId}/pages?limit=100`),
    listAfter5000: await timeRequest(`/api/notes/${noteId}/pages?limit=100&cursor=${cursor}`),
    searchFtsJapanese: await timeRequest(`/api/search?q=${encodeURIComponent("ネットワーク")}`),
    searchFtsEnglish: await timeRequest(`/api/search?q=Durable`),
    searchFtsNoHit: await timeRequest(`/api/search?q=${encodeURIComponent("存在しない語句")}`),
    searchLikeTwoChars: await timeRequest(`/api/search?q=${encodeURIComponent("設計")}`),
    // Worst case for short terms: no match, so LIKE scans every accessible page.
    searchLikeTwoCharsNoHit: await timeRequest(`/api/search?q=${encodeURIComponent("皆無")}`),
  };
}

const worker = await startWorker(PORT);
const browser = await launchBrowser();
const results = { measuredAt: new Date().toISOString(), seedPages: SEED_PAGES, runs: [] };
try {
  cookie = await signInViaApi(BASE, `bench-${Date.now()}@example.com`);
  noteId = (await (await apiFetch("/api/me")).json()).defaultNoteId;
  const t0 = performance.now();
  const seeded = await (
    await apiFetch("/api/dev/seed", { method: "POST", body: JSON.stringify({ count: SEED_PAGES }) })
  ).json();
  results.seed = { ...seeded, clientMs: Math.round(performance.now() - t0) };
  console.error(`seeded ${seeded.inserted} pages in ${seeded.ms} ms`);
  results.api = await measureApi();
  for (const cpuRate of CPU_RATES) {
    console.error(`CPU throttle x${cpuRate}…`);
    results.runs.push({
      cpuRate,
      notes: await measureNotes(browser, cpuRate),
      typingSmallDoc: await measureTyping(browser, cpuRate, { paragraphs: 0 }),
      typingLargeDoc: await measureTyping(browser, cpuRate, { paragraphs: 2000 }),
      typingLargeDocNoCollab: await measureTyping(browser, cpuRate, {
        paragraphs: 2000,
        collab: false,
      }),
      collabPropagationMs: await measureCollab(browser, cpuRate),
      aiDirect: await measureAi(browser, cpuRate, "direct"),
      aiState: await measureAi(browser, cpuRate, "state"),
      aiBlocks: await measureAi(browser, cpuRate, "blocks"),
      aiDirect10k: await measureAi(browser, cpuRate, "direct", 10_000),
      aiBlocks10k: await measureAi(browser, cpuRate, "blocks", 10_000),
      aiState10k: await measureAi(browser, cpuRate, "state", 10_000),
    });
  }
} finally {
  await browser.close();
  worker.kill();
}

mkdirSync(join(root, "results"), { recursive: true });
writeFileSync(join(root, "results/measurements.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
