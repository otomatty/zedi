# セルフレビュー: develop vs main

**日時**: 2026-03-14 00:14
**ベース**: main
**変更ファイル数**: 16 files（`main..develop` のツリー差分）
**関連ファイル数**: 7 files（`docs/guides/branch-strategy.md`, `usePageQueries`, `StorageAdapterPageRepository`, `ImageNodeView`, `StorageImageExtension`, `useMarkdownExport`, `PageEditorContent` を追加確認）

## サマリー

現在の作業ブランチは `develop` のため、`develop..HEAD` にローカル差分はない。レビュー対象は `main` に未反映の `develop` 側 4 コミットで、実質的な変更は Web Clipper の UX 改善、WikiLink サジェスト抑制、PR レビュー運用ドキュメント更新、Cloudflare Pages 本番 deploy retry の 4 つに集中していた。

WikiLink 側の実装と E2E 追加は概ね妥当で、閉じた `[[...]]` 内でサジェストを出さない目的は達成できている。一方で Web Clipper にはゲスト利用を壊す挙動回帰と非同期 race、運用ドキュメントには GitHub の conversation resolution とずれる記述、さらに変更ファイル自身の `format:check` 失敗が残っている。

## 対象コミット

| コミット  | 概要                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| `9472775` | `fix(ci): add timeout_minutes to deploy-prod retry (#346)`                                         |
| `d5ea28a` | `fix(editor): wikilink 入力補助を閉じた ]] 内では発動させない (#348)`                              |
| `116e585` | `feat(web-clipper): auto-parse on paste, remove citation block, embed OGP thumbnail (#339) (#350)` |
| `13a3ba9` | `Merge pull request #345 from otomatty/main`                                                       |

## ファイルサイズ

| ファイル                                                       | 行数 | 判定                           |
| -------------------------------------------------------------- | ---- | ------------------------------ |
| `.cursor/skills/handle-pr-review/SKILL.md`                     | 134  | OK                             |
| `.github/workflows/deploy-prod.yml`                            | 134  | OK                             |
| `AGENTS.md`                                                    | 97   | OK                             |
| `docs/investigations/web-clipper-ux-improvements.md`           | 154  | OK                             |
| `docs/investigations/wikilink-suggestion-closed-brackets.md`   | 139  | OK                             |
| `docs/reviews/review-wikilink-closed-brackets-20260313.md`     | 56   | OK                             |
| `e2e/linked-pages.spec.ts`                                     | 206  | OK                             |
| `src/components/editor/TiptapEditor/useThumbnailCommit.ts`     | 147  | OK                             |
| `src/components/editor/WebClipperDialog.tsx`                   | 282  | Warning: 250行超（分割を推奨） |
| `src/components/editor/extensions/WikiLinkSuggestion.tsx`      | 140  | OK                             |
| `src/components/editor/extensions/wikiLinkSuggestionPlugin.ts` | 160  | OK                             |
| `src/hooks/useWebClipper.test.ts`                              | 131  | OK                             |
| `src/hooks/useWebClipper.ts`                                   | 100  | OK                             |
| `src/lib/htmlToTiptap.test.ts`                                 | 58   | OK                             |
| `src/lib/htmlToTiptap.ts`                                      | 189  | OK                             |
| `src/lib/thumbnailCommit.ts`                                   | 71   | OK                             |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル                                                                                                                                                                                                                                                           | 行                                                                                                             | 観点                | 指摘内容                                                                                                                                                                                                                                                                                                                     | 推奨修正                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/components/editor/WebClipperDialog.tsx`, `src/hooks/usePageQueries.ts`, `src/lib/pageRepository/StorageAdapterPageRepository.ts`                                                                                                                              | `WebClipperDialog.tsx:133-151,166-170` / `usePageQueries.ts:313-329` / `StorageAdapterPageRepository.ts:57-60` | 挙動 / 認証         | Web Clipper が OGP 画像つきページを取り込むたびに `commitThumbnailFromUrl()` を試し、401 だと `/sign-in` へ遷移して処理自体を中断する。`useCreatePage()` と `StorageAdapterPageRepository` は未ログイン時に `local-user` でローカル作成できるのに、今回の変更で「`og:image` があるだけでゲスト取り込み不可」へ後退している。 | 401 時はサインイン誘導を出しても取り込み自体は継続し、元の `thumbnailUrl` またはサムネイルなしへフォールバックする。少なくとも未ログイン時の Web Clipper はブロックしない。  |
| 2   | `src/hooks/useWebClipper.ts`, `src/components/editor/WebClipperDialog.tsx`                                                                                                                                                                                         | `useWebClipper.ts:68-72` / `WebClipperDialog.tsx:62-71,113-123`                                                | 挙動 / データ整合性 | `reset()` が `clipIdRef` を進めないため、URL変更やダイアログ close 後でも旧リクエストが完了すると stale な `clippedContent` が state に戻る。別 URL のプレビューが再表示されたり、閉じたダイアログを開き直した直後に古い結果が見える race になる。                                                                           | `reset()` でも `clipIdRef.current += 1` して in-flight 応答を無効化する。必要なら `AbortController` を併用し、URL変更・close の両経路で前回 request を確実にキャンセルする。 |
| 3   | `src/components/editor/TiptapEditor/useThumbnailCommit.ts`, `src/components/editor/WebClipperDialog.tsx`, `src/hooks/useWebClipper.test.ts`, `src/hooks/useWebClipper.ts`, `src/lib/htmlToTiptap.test.ts`, `src/lib/htmlToTiptap.ts`, `src/lib/thumbnailCommit.ts` | `-`                                                                                                            | プロジェクト規約    | `bun run format:check` が今回の変更ファイル 7 件で失敗している。ガイドライン上 `format:check` を通す前提のため、この状態ではマージ基準を満たしていない。                                                                                                                                                                     | 変更ファイルに `prettier --write` を適用し、`bun run format:check` が成功することを確認する。                                                                                |

### 🟡 Warning（修正を推奨）

| #   | ファイル                                                                                                                                                                                                                                    | 行                                                                                                                               | 観点                | 指摘内容                                                                                                                                                                                                                                                                                              | 推奨修正                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/htmlToTiptap.ts`, `src/components/editor/WebClipperDialog.tsx`, `src/components/editor/TiptapEditor/useThumbnailCommit.ts`, `src/components/editor/ImageNodeView.tsx`, `src/components/editor/extensions/StorageImageExtension.ts` | `htmlToTiptap.ts:175-179` / `WebClipperDialog.tsx:137-142` / `useThumbnailCommit.ts:77-83,101-108` / `ImageNodeView.tsx:137-146` | データ整合性 / UX   | Web Clipper 経由で commit したサムネイル画像は `provider` を受け取っているのに、Tiptap の `image` node に `storageProviderId` を入れていない。既存の手動サムネイル挿入では同属性を設定しており、今回の経路だけ「保存先: 不明」表示やストレージ削除導線の判定がずれる。                                | `commitThumbnailFromUrl()` の戻り値 `provider` を `getTiptapContent` 経由で `formatClippedContentAsTiptap` に渡し、`image.attrs.storageProviderId` を付与する。       |
| 2   | `src/lib/htmlToTiptap.ts`, `src/components/editor/PageEditor/useMarkdownExport.ts`, `src/components/editor/PageEditor/PageEditorContent.tsx`                                                                                                | `htmlToTiptap.ts:157-187` / `useMarkdownExport.ts:13-35` / `PageEditorContent.tsx:130-131`                                       | 挙動 / データ保持   | 引用元ブロックを content から完全に外したため、エディタ画面では `SourceUrlBadge` で見えていても Markdown export / copy では引用元情報が消える。クリップしたページを外部へ持ち出すと attribution が失われる。                                                                                          | 「本文内の重複表示は消すが export では source URL を残す」方針にするか、Markdown export 側で `sourceUrl` を前置するなど、持ち出し時の attribution を保持する。        |
| 3   | `AGENTS.md`, `.cursor/skills/handle-pr-review/SKILL.md`, `docs/guides/branch-strategy.md`                                                                                                                                                   | `AGENTS.md:51-61` / `.cursor/skills/handle-pr-review/SKILL.md:23-42` / `branch-strategy.md:196-208`                              | 運用 / ドキュメント | 「返信済みコメントを除外 = 未対応コメントのみ取得」という新フローは、GitHub の `Require conversation resolution before merging` と一致していない。返信済みだが未解決の thread を見落としうえ、`gh api repos/.../pulls/{number}/comments` はデフォルト 1 page のため件数が多い PR では後半も欠落する。 | 「未返信」ではなく「未解決 thread」を取得する設計に修正し、少なくとも pagination を明示する。ドキュメント上も “未対応” と “未返信” を同一視しない。                   |
| 4   | `.github/workflows/deploy-prod.yml`                                                                                                                                                                                                         | `99-106`                                                                                                                         | CI / 再現性         | `deploy-admin` だけ `bun install` を `--frozen-lockfile` なしで実行しており、他 job と再現性ポリシーが揃っていない。`admin/bun.lock` と実際の解決結果がずれても build が通る可能性がある。                                                                                                            | `admin` 側も `bun install --frozen-lockfile` に揃え、lockfile drift を CI で早期検知する。                                                                            |
| 5   | `src/components/editor/WebClipperDialog.tsx`                                                                                                                                                                                                | `47-281`                                                                                                                         | 可読性・保守性      | コンポーネント全体が 282 行、`bun run lint` でも `max-lines-per-function` warning が出ている。自動解析、paste 処理、thumbnail commit、dialog reset、submit まで単一コンポーネントに責務が集中しており、今回の stale response 問題も追いにくくなっている。                                             | `useWebClipperDialogState` のような hook と、preview / footer / submit 周りの小コンポーネントへ分割する。少なくとも「clip lifecycle」と「submit lifecycle」は分ける。 |

### 🟢 Info（任意の改善提案）

| #   | ファイル                                                                                                                                    | 行             | 観点               | 指摘内容                                                                                                                                                                                                                                                                                                        | 推奨修正                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/investigations/web-clipper-ux-improvements.md`                                                                                        | `19-29,97-125` | ドキュメント整合性 | 調査メモの「現在のフロー」が実装前提の記述のままで、`WebClipperDialog` が既に auto-clip と submit 分離へ変わった現状を反映していない。今後この文書を元に追加作業すると認識ズレを招く。                                                                                                                          | 調査メモを「検討時点の前提」と「実装後の現状」で分けるか、現状セクションを更新する。                                      |
| 2   | `docs/investigations/wikilink-suggestion-closed-brackets.md`                                                                                | `37-43`        | ドキュメント整合性 | `[[A]] [[B]]` の `"B" の途中` を「この例は意図通りでよい」としているが、文書冒頭の要件と現実装はどちらも「閉じた `[[...]]` 内では発動させない」方向。表の 1 行だけ要件と逆になっている。                                                                                                                        | 例表を現在の仕様に合わせて修正する。                                                                                      |
| 3   | `src/components/editor/WebClipperDialog.tsx`, `src/hooks/useWebClipper.test.ts`, `src/lib/htmlToTiptap.test.ts`, `e2e/linked-pages.spec.ts` | `-`            | テスト             | `useWebClipper` と `htmlToTiptap` の単体テストは追加されているが、今回の高リスク経路である guest clipping、close/URL change race、thumbnail commit の provider 伝播にはテストがない。WikiLink 側も「閉じたリンク内で出ない」は E2E 追加済みだが、同一段落で新しい `[[` を打ったとき再び出る正方向ケースがない。 | Web Clipper は `WebClipperDialog` に統合テストを追加し、WikiLink は positive case を 1 本足して over-suppression を防ぐ。 |

## テストカバレッジ

| 変更ファイル                                                                                            | テストファイル                    | 状態                                            |
| ------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| `src/hooks/useWebClipper.ts`                                                                            | `src/hooks/useWebClipper.test.ts` | ✅ 既存テスト更新あり                           |
| `src/lib/htmlToTiptap.ts`                                                                               | `src/lib/htmlToTiptap.test.ts`    | ✅ 既存テスト更新あり                           |
| `src/components/editor/extensions/wikiLinkSuggestionPlugin.ts`                                          | `e2e/linked-pages.spec.ts`        | ✅ E2E 追加あり（単体テストは未作成）           |
| `src/components/editor/WebClipperDialog.tsx`                                                            | -                                 | ⚠️ 専用テスト未作成                             |
| `src/components/editor/TiptapEditor/useThumbnailCommit.ts`, `src/lib/thumbnailCommit.ts`                | -                                 | ⚠️ 専用テスト未作成                             |
| `AGENTS.md`, `.cursor/skills/handle-pr-review/SKILL.md`, `.github/workflows/deploy-prod.yml`, `docs/**` | -                                 | ℹ️ ドキュメント / CI 設定のため自動テスト対象外 |

## Lint / Format チェック

- `bun run lint`: **0 errors, 80 warnings**。今回の変更ファイルで直接目立つものは `src/components/editor/WebClipperDialog.tsx` の `max-lines-per-function` warning。その他の warning は既存ファイルに広く分布している。
- `bun run format:check`: **失敗**。対象は `src/components/editor/TiptapEditor/useThumbnailCommit.ts`, `src/components/editor/WebClipperDialog.tsx`, `src/hooks/useWebClipper.test.ts`, `src/hooks/useWebClipper.ts`, `src/lib/htmlToTiptap.test.ts`, `src/lib/htmlToTiptap.ts`, `src/lib/thumbnailCommit.ts`。
- `bun run test:run src/hooks/useWebClipper.test.ts src/lib/htmlToTiptap.test.ts`: **10 tests passed**。ただし `htmlToTiptap.test.ts` 実行時に Tiptap の `Duplicate extension names found: ['link']` warning は出ている。

## セキュリティ・設計メモ

- `htmlToTiptap.ts` は `DOMParser` を使い、`script`, `iframe`, `object`, `embed` などを除去しており、危険な HTML をそのまま editor に渡さない方向性は妥当。
- `wikiLinkSuggestionPlugin.ts` の `textAfter` 判定は閉じた `[[...]]` 内抑制としてシンプルで、現状の E2E と整合している。今回確認した範囲では即時の回帰は見当たらなかった。
- Web Clipper の変更は UX 改善意図自体は良いが、「guest も使える local-first 設計」と「storage-aware image node」の既存設計を部分的に外している。既存責務との接続点まで含めて再調整が必要。

## 統計

- Critical: 3 件
- Warning: 5 件
- Info: 3 件
