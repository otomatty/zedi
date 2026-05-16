/**
 * E2E 用のテキスト中心ミニ PDF を生成する。
 *
 * Generates the deterministic, text-only fixture PDF consumed by
 * `e2e/pdf-knowledge.spec.ts` (issue otomatty/zedi#863).
 *
 * 目的 / Why a generator instead of a committed binary:
 *   - PDF は xref テーブルにバイト単位のオフセットが必要なので、手書きすると
 *     diff レビューが事実上不可能になる。生成スクリプトを残しておけば、内容を
 *     変えたいときに再生成すればよく、レビューも script の diff だけで済む。
 *   - PDFs embed exact byte offsets in the xref table, so a hand-edited binary
 *     is unreviewable. Keeping the generator lets contributors regenerate the
 *     fixture from a readable script when the test corpus needs to change.
 *
 * 使い方 / Usage:
 *   bun run scripts/gen-pdf-fixture.ts
 *   → writes `e2e/fixtures/sample.pdf` (well below the 1 MB cap in #863).
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const OUTPUT_PATH = "e2e/fixtures/sample.pdf";

/**
 * 「Hello Zedi E2E PDF」を 2 ページ表示するだけのミニ PDF を組み立てる。
 *
 * Builds a tiny 2-page text-only PDF rendering deterministic strings on each
 * page so the E2E spec can assert on selectable text and deep-link to `#page=2`.
 *
 * 戻り値 / Returns: 完成した PDF のバイト列 (Uint8Array)。
 */
function buildSamplePdf(): Uint8Array {
  // 各ページのコンテンツストリーム本文を別途組み立て、Length を正確に計算する。
  // Build the per-page content streams separately so we can attach an exact
  // `/Length` value to each stream dict (pdf.js will refuse mismatched lengths).
  const page1Content =
    "BT\n/F1 24 Tf\n72 720 Td\n(Hello Zedi E2E PDF) Tj\n0 -36 Td\n(Page one body text) Tj\nET\n";
  const page2Content =
    "BT\n/F1 24 Tf\n72 720 Td\n(Second page heading) Tj\n0 -36 Td\n(Page two body text) Tj\nET\n";

  // 各 obj を文字列の配列として生成する。xref で参照するバイトオフセットは
  // 後段で連結時に計測する。
  // Each object's body. The xref byte offsets are computed below as we
  // concatenate the actual file bytes.
  const objects: string[] = [
    // 1: Catalog
    "<< /Type /Catalog /Pages 2 0 R >>",
    // 2: Pages
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    // 3: Page 1
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    // 4: Page 1 content stream
    `<< /Length ${page1Content.length} >>\nstream\n${page1Content}endstream`,
    // 5: Page 2
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    // 6: Page 2 content stream
    `<< /Length ${page2Content.length} >>\nstream\n${page2Content}endstream`,
    // 7: Font
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteCursor = 0;

  /**
   * 任意のバイト列を出力ストリームに追加し、byteCursor を進める。
   * Appends raw bytes to the output stream and advances the cursor.
   */
  const push = (bytes: Uint8Array | string) => {
    const buf = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
    parts.push(buf);
    byteCursor += buf.byteLength;
  };

  // PDF ヘッダ。バイナリビューアで識別されるよう「%」コメント行も入れる。
  // PDF header line + binary-marker comment (PDF 1.4 spec recommendation).
  push("%PDF-1.4\n%âãÏÓ\n");

  // 各 obj を出力し、それぞれの開始バイトオフセットを記録する。
  // Emit each object and remember its starting byte offset for the xref table.
  objects.forEach((body, index) => {
    const objNumber = index + 1;
    offsets.push(byteCursor);
    push(`${objNumber} 0 obj\n${body}\nendobj\n`);
  });

  // xref テーブルの開始位置を覚えておき、trailer から参照する。
  // Record the xref table's offset before we start writing it.
  const xrefStart = byteCursor;

  // xref テーブル本体。行長は PDF 仕様で 20 バイト固定。
  // The xref table; each entry must be exactly 20 bytes including the newline.
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  push(xref);

  // trailer。/Root と /Size を必須で含める。startxref は xrefStart を指す。
  // Trailer dict referencing the catalog + size, then the startxref pointer.
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // 全パーツを連結して返す。
  // Concatenate every part into a single contiguous buffer.
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

async function main(): Promise<void> {
  const bytes = buildSamplePdf();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await Bun.write(OUTPUT_PATH, bytes);
  console.log(`Wrote ${OUTPUT_PATH} (${bytes.byteLength} bytes)`);
}

await main();
