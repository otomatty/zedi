/**
 * タグ名 (`#name`) として許容する文字の集合を 1 ヶ所に集約した定数。
 * 正規表現の文字クラス (`[...]`) の **中身だけ** を提供する。完成した正規表現
 * を共有しないのは、貼り付け検出 (client) と名前検証 (server) で
 * フラグ・アンカー・先読みが異なるため。両者には同じ文字集合だけを揃えれば
 * 十分で、用途依存の組み立ては各呼び出し側に任せる方がドリフトに強い。
 *
 * Single source of truth for the character set allowed inside a tag name
 * (`#name`). Exposes only the **inner contents** of a regex character class
 * (`[...]`). The full regex is intentionally not shared because the
 * paste-detection regex (client) and the name-validation regex (server) need
 * different flags, anchors, and look-arounds. Sharing only the character set
 * keeps drift-prone surface area minimal.
 *
 * 含まれる字種 / Included scripts:
 * - 半角英数字: `A-Za-z0-9`
 * - 区切り: アンダースコア `_`、ハイフン `-`
 * - ひらがな: U+3040..U+309F (`぀-ヿ` の前半)
 * - カタカナ: U+30A0..U+30FF (`぀-ヿ` の後半)
 * - CJK 統合漢字 + 拡張 A: U+3400..U+9FFF (`㐀-鿿`)
 *
 * 同期義務 / Sync obligation:
 * - 本ファイルを編集したら、`server/api/src/services/ydocRenameRewrite.ts`
 *   の `TAG_NAME_CHAR_CLASS_STRING` も一致させること。`server/api` はワーク
 *   スペース外（自前の `bun.lock` を持つ Railway ビルド）なのでこの定数を
 *   直接 import できない。代わりに `src/lib/tagCharacterClassSync.test.ts`
 *   が両者の文字列一致を CI でチェックする。
 *
 *   When this file changes, also update
 *   `server/api/src/services/ydocRenameRewrite.ts`'s
 *   `TAG_NAME_CHAR_CLASS_STRING` to match. `server/api` lives outside the
 *   Bun workspace (its own `bun.lock` is consumed by Railway), so it cannot
 *   import this constant. `src/lib/tagCharacterClassSync.test.ts` enforces
 *   the equality in CI.
 */
export const TAG_NAME_CHAR_CLASS = "A-Za-z0-9_\\-぀-ヿ㐀-鿿";
