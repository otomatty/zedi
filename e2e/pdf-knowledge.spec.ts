/**
 * E2E: PDF 知識化フロー (issue otomatty/zedi#863, follow-up to #389 / #858).
 *
 * このスペックは「PDF 本体のバイト列は絶対にサーバへ送られない」を前提とした
 * Phase 1 のフローを守るためのテスト群を集約する。実際の登録 → ハイライト →
 * 派生ページ → backlink → リロード後永続性、というフルフロー (1〜6) は Tauri
 * デスクトップランタイム＋tauri-driver を必要とするため、現状の Chromium 専用
 * Playwright 環境では `test.fixme()` で骨格だけ用意し、Tauri E2E 基盤の整備を
 * 別 issue に切り出すまでは pending として残す。
 *
 * Coverage map for #863 / Phase 1 acceptance criteria:
 *   ✅ Active here:
 *       - Web (non-Tauri) ターゲットで `/sources/:id/pdf` → `PdfReaderUnsupported`
 *         の文言が出る最小テスト。
 *       - PDF バイナリがネットワーク送信されていないことを E2E 内で確認する
 *         sentinel テスト（ルート遷移時に PDF body を含む POST が無いことを assert）。
 *       - フィクスチャ PDF (`e2e/fixtures/sample.pdf`) の存在チェック（後段の
 *         Tauri E2E が依存するため、欠落は早期に検知したい）。
 *   ⏳ Pending (`test.fixme`, requires tauri-driver + native Tauri build):
 *       - シナリオ 1: ファイルダイアログから PDF を登録 → ビューアに遷移
 *       - シナリオ 2: テキスト選択 → 「ハイライト保存」 → 一覧に出現
 *       - シナリオ 3: 「保存して新規ページ」 → 派生ページ + 引用ブロック + 出典リンク
 *       - シナリオ 4: 出典リンク → `#page=N` ディープリンク
 *       - シナリオ 5: リロード（ウィンドウ再起動）後の永続性
 *       - シナリオ 6: ファイル移動 → `MissingPdfBanner` → 「再アタッチ」
 *
 * The pending block is intentionally `test.fixme`, not `test.skip`, so it shows
 * up in CI reports as work-to-do rather than being silently hidden.
 */
import { existsSync, statSync } from "node:fs";
import type { Request } from "@playwright/test";
import { test, expect } from "./auth-mock";

/**
 * Playwright は project root (cwd) から spec を起動するため、ここでは
 * リポジトリルートからの相対パスで十分。`__dirname` は ESM/CJS の差で罠が
 * 多いので避ける。
 * Playwright launches specs from the project root, so a cwd-relative path is
 * the most portable way to refer to the fixture without fighting ESM/CJS.
 */
const SAMPLE_PDF_PATH = "e2e/fixtures/sample.pdf";

/**
 * `/api/sources/pdf` 系のエンドポイント名。Phase 1 ではバイナリ本体を受け取らない
 * 設計なので、ここに PDF バイト列を含む POST が飛んだら設計違反として fail する。
 *
 * Endpoints that must never receive raw PDF bytes. Phase 1's contract is that
 * the server only gets hashes + metadata + highlights — the actual bytes stay
 * on the user's disk via the Tauri-side registry.
 */
const PDF_API_PATH_PATTERN = /\/api\/sources\/pdf(?:$|\/)/u;

/**
 * 「raw PDF」「base64 化された PDF」のどちらでも本文先頭に現れるマジック文字列。
 * 単なるサイズしきい値だと、本 PR の sample.pdf (~941 B) のような小さい
 * フィクスチャが誤って POST されたとき false negative になる。代わりに
 * PDF シグネチャ (`%PDF-`) と、その base64 表現 (`JVBERi0`) を直接探す。
 *
 * Both raw and base64-encoded PDFs start with one of these markers. The Phase 1
 * invariant is "no PDF bytes on the wire" regardless of payload size, so a
 * size-only threshold is too lax — a regression that uploads even the 941-byte
 * `sample.pdf` fixture would slip past one. Magic-byte matching closes that
 * gap (see review feedback on #871).
 */
const PDF_BODY_MARKERS = ["%PDF-", "JVBERi0"] as const;

/**
 * リクエスト body の中に PDF バイナリ (生 / base64) が混入していないか調べる。
 * Phase 1 contract: PDF bytes must never be uploaded to the server. Inspect
 * the raw post body for the PDF magic bytes — both the literal `%PDF-` header
 * and the `JVBERi0` prefix that a base64-encoded PDF starts with.
 *
 * @returns 検出時は判定根拠を含むオブジェクト、未検出時は `null`。
 */
function detectPdfBytesInBody(
  request: Request,
): { marker: string; bodySize: number; method: string } | null {
  const buf = request.postDataBuffer();
  if (!buf) return null;
  // latin1 でデコードすると 0x00-0xFF が 1:1 で文字に写るため、バイナリの中に
  // 紛れた ASCII シグネチャを安全に探せる。utf-8 だと不正なシーケンスで早期に
  // 切れる可能性があるため避ける。
  // latin1 maps every byte 1:1 to a code point, so ASCII signatures embedded
  // in arbitrary binary survive the decode. utf-8 can silently truncate on
  // invalid sequences, which would let a regression slip past.
  const text = buf.toString("latin1");
  for (const marker of PDF_BODY_MARKERS) {
    if (text.includes(marker)) {
      return { marker, bodySize: buf.byteLength, method: request.method() };
    }
  }
  return null;
}

test.describe("PDF knowledge ingestion — fixtures sanity", () => {
  test.setTimeout(30_000);

  test("sample fixture PDF is present and below 1 MB", () => {
    // `bun run scripts/gen-pdf-fixture.ts` を回し忘れた場合、後段の Tauri 用
    // テスト群がデバッグしづらい形で落ちる。早い段階で明確に失敗させる。
    // Fail loudly when the fixture is missing, so a developer who forgot to
    // regenerate it doesn't waste time chasing opaque downstream errors.
    expect(existsSync(SAMPLE_PDF_PATH)).toBe(true);
    const { size } = statSync(SAMPLE_PDF_PATH);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(1024 * 1024);
  });
});

test.describe("PDF knowledge ingestion — web (non-Tauri) target", () => {
  test.setTimeout(60_000);

  test("/sources/:id/pdf shows the desktop-only placeholder in a regular browser", async ({
    page,
  }) => {
    // モック認証下の通常 Chromium には `__TAURI_INTERNALS__` が無いので
    // `isTauriDesktop()` が false → `PdfReaderUnsupported` が描画される想定。
    // The mock-auth Chromium target has no `__TAURI_INTERNALS__`, so
    // `isTauriDesktop()` returns false and `PdfReaderUnsupported` should render.
    await page.goto("/sources/nonexistent-source-id/pdf");
    await page.waitForLoadState("networkidle");

    // 日本語・英語の両方を確認する（プロジェクト規約上どちらも併記される）。
    // Assert both Japanese and English copy — both are part of the contract.
    await expect(page.getByText("PDF 知識化はデスクトップ版のみ対応")).toBeVisible();
    await expect(page.getByText(/Desktop-only/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /ノートに戻る|Back to your notes/i }),
    ).toBeVisible();
  });

  test("does not POST any PDF binary to /api/sources/pdf* on web", async ({ page }) => {
    // ネットワークインターセプト sentinel。Phase 1 設計違反を early-detect する。
    // サイズ依存ではなく PDF マジックバイトで判定するので、本 PR の 941 バイト
    // フィクスチャのような小サイズの regression も確実にフラグできる。
    // Network-level sentinel for the "no PDF bytes on the wire" Phase 1
    // contract. Uses magic-byte detection rather than a size threshold so a
    // regression that uploads even the ~941-byte fixture is still caught.
    const offendingRequests: {
      url: string;
      method: string;
      marker: string;
      bodySize: number;
    }[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!PDF_API_PATH_PATTERN.test(new URL(url).pathname)) return;
      const hit = detectPdfBytesInBody(request);
      if (hit) offendingRequests.push({ url, ...hit });
    });

    // Web 側からは結局 `/sources/:id/pdf` がアンサポート画面になるが、それでも
    // 念のためフルロードまで待ってから assertion する。
    // Even though the web path is unsupported, wait for full load before
    // asserting so any rogue request has time to fire.
    await page.goto("/sources/nonexistent-source-id/pdf");
    await page.waitForLoadState("networkidle");

    expect(
      offendingRequests,
      `Phase 1 では PDF バイナリを /api/sources/pdf* に送ってはいけない。検知: ${JSON.stringify(
        offendingRequests,
      )}`,
    ).toEqual([]);
  });
});

test.describe("PDF knowledge ingestion — Tauri desktop scenarios", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // これらのシナリオは「実 Tauri デスクトップ + tauri-driver」を必要とする。
  // 現在の playwright.config.ts は Chromium のみ + Vite dev server で動作する
  // ため、ここでフルフローを再現すると `__TAURI_INTERNALS__` 偽装の信頼性が
  // 低く、テストが脆い偽陽性を量産する恐れがある。
  //
  // 取るべきフォローアップ:
  //   1. `tauri-driver` ベースの別 Playwright プロジェクト or 別 spec を追加
  //      (e.g. `playwright.tauri.config.ts`).
  //   2. CI でデスクトップ Linux runner を用意し、`bun run tauri build` した
  //      バイナリに対して webdriver セッションを張る。
  //   3. ファイルダイアログは `WebDriverIO` の Tauri プラグイン or 環境変数で
  //      明示的にバイパスする（real OS dialog は CI で扱えない）。
  //
  // それまではここの本文をフルで再構築せず、`test.fixme()` で「未完了として
  // 可視化」する。`test.skip` だと PR レポートで沈黙するため避ける。
  //
  // These scenarios need a real Tauri webview + tauri-driver. Until that
  // infrastructure ships (tracked as a follow-up to #863), keep them
  // `test.fixme` so they show up in CI reports as outstanding work instead of
  // being silently skipped.
  // ─────────────────────────────────────────────────────────────────────────
  test.setTimeout(120_000);

  test.fixme("registers a PDF via the file dialog and lands on the viewer", async () => {
    // TODO(#863 follow-up): drive `OpenPdfButton` through tauri-driver, mock
    // the OS file dialog to return `e2e/fixtures/sample.pdf`, then assert that
    // the URL settles on `/sources/:sourceId/pdf` and the canvas renders.
  });

  test.fixme("selects text and saves a highlight that appears in the sidebar", async () => {
    // TODO(#863 follow-up): select a known string from page 1 of
    // `e2e/fixtures/sample.pdf` (e.g. "Hello Zedi E2E PDF"), click
    // `[data-testid="pdf-highlight-toolbar"] [data-action="save"]`, then assert
    // the highlight row appears in `HighlightSidebar`.
  });

  test.fixme("'save and derive' creates a derived page with citation + source link", async () => {
    // TODO(#863 follow-up): trigger the save-and-derive flow, follow the
    // navigation, and assert that the rendered page contains both a citation
    // block (excerpt) and a source link pointing back to the original PDF.
  });

  test.fixme("the source link deep-links back to the original PDF page (#page=N)", async () => {
    // TODO(#863 follow-up): click the source link from the derived page and
    // assert the resulting URL hash matches `#page=2` (or whichever page the
    // highlight lives on), and that the viewer actually scrolls there.
  });

  test.fixme("highlights and derived pages survive a window reload", async () => {
    // TODO(#863 follow-up): after the create-and-derive flow, reload the
    // Tauri window (or close+reopen via tauri-driver) and re-assert that the
    // highlight + derived page + citation are still visible.
  });

  test.fixme("missing file triggers MissingPdfBanner and re-attach restores the viewer", async () => {
    // TODO(#863 follow-up): rename / move the fixture PDF on disk, restart the
    // viewer, assert `MissingPdfBanner` is shown, then re-attach via the file
    // dialog mock and assert the viewer recovers.
  });
});
