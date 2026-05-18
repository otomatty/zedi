/**
 * `page_sources.section_anchor` 上で「派生ページの出典がどの PDF ハイライトか」を
 * 表現するためのエンコード/デコードユーティリティ。
 *
 * Utility for encoding/decoding the `page_sources.section_anchor` column when
 * the source is a local PDF highlight (`sources.kind = "pdf_local"`).
 *
 * 形式: `pdf:v1:<highlightId>`
 *   - `pdf` … スキーマ名（将来 `epub` / `slide` などに拡張可能）。
 *   - `v1`  … バージョン。互換性破壊時に v2 を導入する。
 *   - `<highlightId>` … `pdf_highlights.id` (UUID v4)。
 *
 * `page_sources` のプライマリキーは `(page_id, source_id, section_anchor)`
 * なので anchor は短く保つ必要がある。本実装は **highlight id だけ**を埋め、
 * 矩形 / ページ番号などの詳細情報は `pdf_highlights` 行を引いて取得する。
 *
 * The `page_sources` composite PK includes `section_anchor`, so we keep the
 * anchor short. Only the highlight UUID is embedded here; rects / page numbers
 * live on the `pdf_highlights` row and are looked up by id.
 */

/**
 * Anchor 文字列の先頭プレフィックス（バージョン込み）。
 * Header of the encoded anchor string (includes the version).
 */
export const PDF_SECTION_ANCHOR_PREFIX = "pdf:v1:" as const;

/**
 * Anchor 文字列の最大長。`page_sources.section_anchor` の PK 制約で
 * 過剰に長い値を入れないようガードする。
 * Upper bound for the encoded anchor length; protects the composite PK on
 * `page_sources` from overly long values.
 */
export const MAX_PDF_SECTION_ANCHOR_LENGTH = 64;

/**
 * UUID v1〜v8 の許容パターン（厳密版より緩く、`gen_random_uuid()` 出力を受け入れる）。
 * UUID pattern accepting v1〜v8; relaxed enough for `gen_random_uuid()` output.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * sectionAnchor の解析・整形時のエラー。
 * Error thrown by encode/decode when the input shape is invalid.
 */
export class PdfSectionAnchorError extends Error {
  /** Build the error and tag the class name for instanceof checks. */
  constructor(message: string) {
    super(message);
    this.name = "PdfSectionAnchorError";
  }
}

/**
 * デコード結果。バージョンとハイライト ID を返す。
 * Decoded payload — version + highlight id.
 */
export interface DecodedPdfSectionAnchor {
  version: 1;
  highlightId: string;
}

/**
 * `pdf:v1:<highlightId>` を組み立てる。
 * Encode a highlight id into a `pdf:v1:` section anchor.
 *
 * @throws PdfSectionAnchorError - 入力 ID が UUID でない場合。If id is not a UUID.
 */
export function encodePdfSectionAnchor(params: { highlightId: string }): string {
  if (!UUID_RE.test(params.highlightId)) {
    throw new PdfSectionAnchorError(
      `highlightId must be a UUID, got: ${JSON.stringify(params.highlightId)}`,
    );
  }
  const anchor = `${PDF_SECTION_ANCHOR_PREFIX}${params.highlightId}`;
  if (anchor.length > MAX_PDF_SECTION_ANCHOR_LENGTH) {
    // 防衛的: UUID は固定長なので通常は到達しないが、念のため。
    // Defensive: a well-formed UUID never exceeds the budget, but guard anyway.
    throw new PdfSectionAnchorError(
      `encoded anchor exceeds budget (${anchor.length} > ${MAX_PDF_SECTION_ANCHOR_LENGTH})`,
    );
  }
  return anchor;
}

/**
 * Anchor 文字列が `pdf:v1:` で始まる PDF アンカーかを判定する。
 * Returns true iff the input is shaped like a `pdf:v1:` section anchor.
 */
export function isPdfSectionAnchor(value: string): boolean {
  return value.startsWith(PDF_SECTION_ANCHOR_PREFIX);
}

/**
 * `pdf:v1:<highlightId>` をデコードする。PDF アンカーでなければ `null`。
 * Decode a PDF section anchor; returns `null` for non-PDF anchors so callers
 * can iterate over heterogeneous `page_sources` rows without try/catch.
 *
 * @throws PdfSectionAnchorError - prefix が `pdf:` でバージョンや payload が
 *   壊れている場合（不明バージョン・空 payload・非 UUID）。
 *   Thrown when the prefix looks like a PDF anchor but the payload is invalid
 *   (unknown version, empty payload, non-UUID id) — these indicate a corrupted
 *   row that the caller should surface rather than silently ignore.
 */
export function decodePdfSectionAnchor(value: string): DecodedPdfSectionAnchor | null {
  if (!value.startsWith("pdf:")) {
    return null;
  }
  const remainder = value.slice("pdf:".length);
  const colonIdx = remainder.indexOf(":");
  if (colonIdx < 0) {
    throw new PdfSectionAnchorError(`malformed pdf anchor (missing version separator): ${value}`);
  }
  const version = remainder.slice(0, colonIdx);
  const payload = remainder.slice(colonIdx + 1);
  if (version !== "v1") {
    throw new PdfSectionAnchorError(`unsupported pdf anchor version: ${version}`);
  }
  if (!payload) {
    throw new PdfSectionAnchorError(`pdf anchor payload is empty: ${value}`);
  }
  if (!UUID_RE.test(payload)) {
    throw new PdfSectionAnchorError(`pdf anchor payload is not a UUID: ${payload}`);
  }
  return { version: 1, highlightId: payload };
}
