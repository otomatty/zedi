#!/usr/bin/env node
/**
 * Runtime measurements for the PoC in headless Chromium against a local `wrangler dev`.
 * Requires Playwright with Chromium (`npx playwright install chromium` if missing).
 * Run `bun run build` first; this script starts `wrangler dev` itself on port 8788.
 *
 * ローカルの `wrangler dev` に対し、ヘッドレス Chromium で実行時性能を計測する。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, startWorker } from "./lib/harness.mjs";

const root = join(import.meta.dirname, "..");
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const CPU_RATES = (process.env.CPU_RATES ?? "1,4").split(",").map(Number);

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.close();
  return {
    firstRenderMs: +firstRenderMs.toFixed(1),
    rowsInDom,
    scrollFps: scroll.fps,
    scrollLongTasks,
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
  const room = `bench-${Date.now()}-${paragraphs}-${cpuRate}`;
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
  const room = `collab-${Date.now()}-${cpuRate}`;
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

const worker = await startWorker(PORT);
const browser = await launchBrowser();
const results = { measuredAt: new Date().toISOString(), runs: [] };
try {
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
