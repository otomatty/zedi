# 仕様・ドキュメント方針（Specification policy）

本リポジトリでは **仕様は常にコードのコメント（TSDoc / JSDoc）に書く**ことを徹底する。長文の仕様 Markdown を**リポジトリの正（source of truth）として**持たない。

## 原則

| ルール                       | 内容                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Specification in source**  | 公開 API・モジュール境界に、目的・受入条件の要約・契約・非目標を TSDoc で書く。                                                                                                                                                                          |
| **Tests as contract**        | 振る舞いはテストで表現する（TDD）。                                                                                                                                                                                                                      |
| **No tracked `docs/` tree**  | 仕様書・運用メモ用の Markdown は **Git に追跡させない**（`.gitignore` で `docs/` およびルート `journal/` を除外）。リモートへ載せず、陳腐化した前提をチーム全体に配らない。                                                                              |
| **Local `docs/` (optional)** | 開発者の作業用に、**ローカルだけ**に `docs/reviews/`, `docs/spec/`, `docs/plan/`, `docs/journal/` を置いてよい。下書き・一時メモであり、CI やレビューの契約にはしない。作成手順は [`AGENTS.md`](AGENTS.md)。                                             |
| **Delete obsolete prose**    | 不要になった説明ファイルは削除する（残さない）。                                                                                                                                                                                                         |
| **AI コンテキスト**          | `.cursorignore` で `docs/` を隠すと、**ユーザーが `@` で添付しても読めない**ことがあるため使わない。代わりに **Cursor ルール**（`.cursor/rules/specification-and-docs.mdc`）で「勝手に長文 MD を読まない」「`@` で添付されたファイルは読む」を明示する。 |

## 機能実装のステップ（仕様駆動）

1. **ブランチ** — `feature/…` または `fix/…` で、完了の定義を一文で決める。
2. **Specify（コメント）** — 触るモジュールのファイル先頭または export に、受入条件・スコープ外を TSDoc で書く（長文は Issue / PR 本文に任せ、コード側は要約）。
3. **Plan** — 型・モジュール境界を決め、契約を型とコメントに残す。
4. **Test first** — 失敗するテストを先に書く。
5. **Implement** — 最小実装。TSDoc を実装と一致させる。
6. **Validate** — テストとレビュー。仕様変更は **コメントとテストを先に**更新する。
7. **Remove dead docs** — もう不要な説明・コメント参照は削除する。

## 日誌（Zedi への 1 日分の作業ログ）

- **`docs/journal/today.md`** に、その日の作業内容だけを追記する（**保持は概ね 1 日分**。翌日は新しい内容に置き換えてよい）。
- **定期実行**で Zedi アプリに日誌を残す場合は、別途スケジューラ（cron / GitHub Actions 等）から `docs/journal/today.md` を読み、Zedi の API または手動コピーで取り込む。フォルダ作成は [`AGENTS.md`](AGENTS.md) を参照。

英語併記: **Specification lives in source comments; no tracked Markdown tree as source of truth. Optional local `docs/` is for drafts only.**
