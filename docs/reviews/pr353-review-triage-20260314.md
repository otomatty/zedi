# PR #353 レビューコメント整理（2026-03-14）

**対象 PR**: [otomatty/zedi#353](https://github.com/otomatty/zedi/pull/353)（develop → main）

## 対応する指摘

| #   | ファイル                                    | 指摘概要                                                 | 対応内容                                                                       |
| --- | ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | WebClipperDialog.tsx                        | baseUrl 未設定時に外部 thumbnailUrl がそのまま保存される | baseUrl falsy 時は commitAttemptedAndFailed を設定し、サムネイル埋め込みを抑止 |
| 2   | WebClipperDialog.tsx                        | close 後・世代切替後に commit 失敗トーストが残る         | catch 内で submitGeneration を確認し、不要時は副作用をスキップ                 |
| 3   | review-wikilink-closed-brackets-20260313.md | 変更ファイル数と下表の不整合                             | 下表はコード変更のみである旨を注記                                             |
| 4   | review-wikilink-closed-brackets-20260313.md | waitForTimeout の行範囲が広い                            | 実際の出現行を列挙                                                             |

## 不要（現行 develop で対応済み）

| ファイル                    | 指摘概要                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| useWebClipperDialogState.ts | urlError 公開、lastClippedUrlRef カプセル化、trim 比較、stale content guard |
| WebClipperDialog.tsx        | 再入防止、open の外部変更で submit 無効化                                   |
| htmlToTiptap.ts             | void による未使用引数表記 → `_sourceUrl` / `_siteName` に変更済み           |
| thumbnailCommit.ts          | AbortController timeout、JSDoc、AuthRedirectError コメント                  |
| markdownExport.ts           | 空白 title 時の trim、copyMarkdownToClipboard defaultTitle 未使用           |
| useWebClipper.ts            | null thumbnail fallthrough                                                  |
| useWebClipper.test.ts       | Analysis chain 指摘                                                         |

## 返信方針

- **対応する**: 修正実施後に「対応しました」旨を返信
- **不要**: 「現行 develop で対応済み」または「今回は見送り」と返信
