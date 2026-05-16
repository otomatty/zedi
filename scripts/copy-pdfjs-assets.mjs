#!/usr/bin/env node
/**
 * pdfjs-dist が同梱する CMap と標準フォントを `public/pdfjs/` 配下にコピーする。
 * pdf.js は CJK PDF を描画する際にこれらの外部アセットを必要とする。
 *
 * Copies CMaps and standard fonts shipped with `pdfjs-dist` into
 * `public/pdfjs/` so the runtime can fetch them via the leading-slash
 * absolute URLs `/pdfjs/cmaps/` and `/pdfjs/standard_fonts/`. These paths
 * resolve identically in `vite dev`, `vite build`, and the packaged Tauri
 * production bundle (`tauri://localhost`).
 *
 * 既にコピー済みの場合はミラーリングするためフォルダを置き換える（ライブラリの
 * バージョンアップ時に古いファイルが残らないようにする）。
 * The destination directories are cleaned before copy so that bumping
 * pdfjs-dist does not leave stale files behind.
 */
import { rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * pdfjs-dist の 1 つのアセットディレクトリを `public/pdfjs/` にミラーする。
 * Mirror one pdfjs-dist asset directory into `public/pdfjs/`.
 */
async function mirror(srcRel, destRel) {
  const src = join(root, "node_modules", "pdfjs-dist", srcRel);
  const dest = join(root, "public", "pdfjs", destRel);

  if (!existsSync(src)) {
    console.error(`copy-pdfjs-assets: source missing: ${src}`);
    process.exit(1);
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(`copy-pdfjs-assets: ${srcRel} -> public/pdfjs/${destRel}`);
}

await mirror("cmaps", "cmaps");
await mirror("standard_fonts", "standard_fonts");
