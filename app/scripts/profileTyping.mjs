#!/usr/bin/env node
/**
 * Investigation tool: CPU-profiles typing into a large collaborative document and prints
 * where the main thread spends its time (self time by function). Build without minification
 * first so function names survive: `bunx vite build --minify false`.
 * 調査用: 大きな共同編集文書に入力する間の CPU プロファイルを取り、関数ごとの自己時間を出す。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { addSessionCookies, launchBrowser, signInViaApi, startWorker } from "./lib/harness.mjs";

const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
const PARAGRAPHS = Number(process.env.PARAGRAPHS ?? 2000);
const CPU_RATE = Number(process.env.CPU_RATE ?? 4);
const COLLAB = process.env.COLLAB !== "0";

const worker = await startWorker(PORT);
const browser = await launchBrowser();
try {
  const cookie = await signInViaApi(BASE, `profile-${Date.now()}@example.com`);
  const headers = { cookie, origin: BASE, "content-type": "application/json" };
  const { defaultNoteId } = await (await fetch(`${BASE}/api/me`, { headers })).json();
  const { id } = await (
    await fetch(`${BASE}/api/notes/${defaultNoteId}/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "profile" }),
    })
  ).json();

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await addSessionCookies(context, BASE, cookie);
  const page = await context.newPage();
  await page.goto(`${BASE}/notes/${id}${COLLAB ? "" : "?collab=0"}`);
  await page.waitForSelector("[data-status=synced]");
  await page.evaluate((count) => {
    const html = Array.from(
      { length: count },
      (_, i) => `<p>段落 ${i + 1}: プロファイル用のダミー本文です。#tag${i % 10}</p>`,
    ).join("");
    window.__zediApp.editor.commands.setContent(html);
    window.__zediApp.editor.commands.focus("end");
  }, PARAGRAPHS);
  await page.waitForTimeout(500);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");
  await page.keyboard.type("大きな文書でのプロファイル計測です。".repeat(3), { delay: 30 });
  await page.waitForTimeout(300);
  const { profile } = await cdp.send("Profiler.stop");

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((nodeId, i) => {
    const node = byId.get(nodeId);
    const frame = node.callFrame;
    const file = frame.url.split("/").pop() || "(native)";
    const key = `${frame.functionName || "(anonymous)"} @ ${file}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const idle = ["(idle)", "(program)", "(garbage collector)"].reduce(
    (acc, name) =>
      acc + [...self.entries()].filter(([k]) => k.startsWith(name)).reduce((a, [, v]) => a + v, 0),
    0,
  );
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(
    `paragraphs=${PARAGRAPHS} collab=${COLLAB} cpu=x${CPU_RATE} sampled=${total.toFixed(0)}ms busy(excl idle/program/gc)=${(total - idle).toFixed(0)}ms`,
  );
  for (const [k, v] of top) console.log(`${v.toFixed(1).padStart(8)} ms  ${k}`);
  writeFileSync(
    join(
      import.meta.dirname,
      `../results/raw/profile-${COLLAB ? "collab" : "local"}-${PARAGRAPHS}.cpuprofile`,
    ),
    JSON.stringify(profile),
  );
} finally {
  await browser.close();
  worker.kill();
}
