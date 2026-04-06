import * as Y from "yjs";

/**
 * ページの Y.Xml フラグメントからプレーンテキストを抽出する（クライアント側）。
 * `Y.XmlText.toString()` / `toJSON()` は書式を HTML 風タグで返すため使わず、`toDelta()` の
 * `insert` 文字列のみを集める。
 *
 * 同一 `Y.XmlText` 内で書式の切り替えがあると `toDelta()` は複数 op になる。
 * それらを個別に区切って `join("\n")` すると op 間に誤った改行が入るため、**ノード内では
 * 文字列を連結してから** 1 エントリとして扱う（`server/hocuspocus` の `extractTextFromYXml` と同様）。
 *
 * Extract plain text from the page `Y.XmlFragment` on the client.
 * Avoid `Y.XmlText.toString()` / `toJSON()` (HTML-like tags); use `toDelta()` string inserts only.
 * Concatenate all string inserts within a single `Y.XmlText` before joining block-level parts with newlines.
 */
export function extractPlainTextFromYXmlFragment(fragment: Y.XmlFragment): string {
  const parts: string[] = [];
  const walk = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText) => {
    if (node instanceof Y.XmlText) {
      let plain = "";
      for (const op of node.toDelta()) {
        if (typeof op.insert === "string") {
          plain += op.insert;
        }
      }
      if (plain.length > 0) {
        parts.push(plain);
      }
    } else {
      for (const child of node.toArray()) {
        if (
          child instanceof Y.XmlText ||
          child instanceof Y.XmlElement ||
          child instanceof Y.XmlFragment
        ) {
          walk(child);
        }
      }
    }
  };
  walk(fragment);
  return parts.join("\n").trim();
}
