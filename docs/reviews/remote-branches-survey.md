# リモートブランチ現状（調査日: 2026-03-12）

## 一覧（develop / main 除く）

| ブランチ                                      | PR 状態  | PR 番号 | 向け先                                           | 削除可否            |
| --------------------------------------------- | -------- | ------- | ------------------------------------------------ | ------------------- |
| dependabot/npm_and_yarn/develop/eslint-10.0.3 | **OPEN** | #290    | develop                                          | ❌ 残す（進行中）   |
| cursor/code-formatting-issues-6e98            | MERGED   | #271    | feature/260-code-block-copy-button               | ✅ 削除可（merged） |
| copilot/sub-pr-226                            | MERGED   | #227    | fix/pr-225-review-comments                       | ✅ 削除可（merged） |
| copilot/sub-pr-273                            | CLOSED   | #274    | chore/delete-merged-branches-skill               | ✅ 削除可（closed） |
| copilot/sub-pr-273-again                      | CLOSED   | #275    | 同上                                             | ✅ 削除可（closed） |
| copilot/sub-pr-276                            | CLOSED   | #277    | fix/review-develop-vs-main-actions-pagination-ui | ✅ 削除可（closed） |
| copilot/sub-pr-276-again                      | CLOSED   | #278    | 同上                                             | ✅ 削除可（closed） |
| copilot/sub-pr-291                            | CLOSED   | #292    | fix/pr-280-review-comments                       | ✅ 削除可（closed） |
| copilot/sub-pr-308                            | CLOSED   | #309    | feature/wiki-link-bubble-menu                    | ✅ 削除可（closed） |
| copilot/sub-pr-322                            | CLOSED   | #323    | fix/123-frontend-reliability                     | ✅ 削除可（closed） |
| copilot/sub-pr-324                            | CLOSED   | #325    | chore/review-develop-20250312-feedback           | ✅ 削除可（closed） |

## 補足

- **develop / main**: 保護ブランチのため削除対象外。
- この調査時点の旧実装では「基準ブランチ（develop）向けのクローズ PR」のみ取得していたため、**別ブランチ向け**（例: fix/xxx, feature/xxx）にクローズされた PR のブランチは候補に入っていなかった。
- 本 PR で、クローズ済み未マージ PR は `--base` を付けずリポジトリ全体の closed (unmerged) PR を対象にするよう変更された。
