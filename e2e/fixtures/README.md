# E2E Fixtures

E2E テストで使う固定リソース。Issue [#863](https://github.com/otomatty/zedi/issues/863)
の PDF 知識化フローの E2E 用フィクスチャを置く。

Static assets consumed by Playwright specs. Files here MUST stay small
(< 1 MB target per #863) so the repo doesn't bloat.

## `sample.pdf`

- **生成方法 / How it's built:** `bun run scripts/gen-pdf-fixture.ts`
  (`scripts/gen-pdf-fixture.ts` がバイト単位で組み立てる)
- **特徴 / Characteristics:**
  - 2 ページ、テキストのみ（画像なし）。Two text-only pages.
  - 1 ページ目: `Hello Zedi E2E PDF` / `Page one body text`
  - 2 ページ目: `Second page heading` / `Page two body text`
  - サイズ: ~941 バイト
- **再生成 / Regenerate:** content を変えたいときはスクリプト側を編集して
  `bun run scripts/gen-pdf-fixture.ts` で上書きする。手で PDF を編集しない
  （xref のバイトオフセットがずれて pdf.js が読めなくなる）。
