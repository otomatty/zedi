# リリースとバージョン管理

**目的:** main へのマージ内容に応じてセマンティックバージョン（メジャー / マイナー / パッチ）を自動で更新し、GitHub Release と CHANGELOG を自動作成する。

## 概要

- **Release Please** を利用し、Conventional Commits に基づいてバージョンとリリースノートを自動更新する。
- main に push されるたびに Release Please が走り、リリース可能なコミットがあれば **Release PR** を作成・更新する。
- Release PR をマージすると、タグが打たれ **GitHub Release** が作成され、`package.json` の `version` と `CHANGELOG.md` が更新される。
- アプリの設定画面（一般設定）に「アプリについて」で現在のバージョンとリリースノートへのリンクを表示する。

## バージョン判定ルール（Conventional Commits）

| コミット種別                                     | バージョン                                     | 例                                                |
| ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| `feat:`                                          | マイナー (0.1.0 → 0.2.0)                       | `feat: add dark mode`                             |
| `fix:`                                           | パッチ (0.1.0 → 0.1.1)                         | `fix: resolve login redirect`                     |
| `BREAKING CHANGE:` または `feat!:` / `fix!:`     | メジャー (0.1.0 → 1.0.0)                       | 本文に `BREAKING CHANGE:` を記載、または `feat!:` |
| `docs:`, `chore:`, `style:`, `test:`, `ci:` など | リリースノートには含めず、バージョンも上げない | 他の feat/fix とまとめてリリース                  |

既存の **commitlint**（`@commitlint/config-conventional`）のルールに合わせてコミットメッセージを書けば、そのまま Release Please の判定に使われる。

## 運用フロー

1. 開発は通常どおり feature ブランチで行い、**Conventional Commits** でコミットする。
2. main にマージすると **Release Please** ワークフローが実行される。
3. リリース対象のコミットがある場合、**Release PR**（`chore(main): release 0.2.0` のようなタイトル）が自動作成または更新される。
4. Release PR をマージすると:
   - `package.json` の `version` が更新される
   - `CHANGELOG.md` が更新される
   - 対応する Git タグ（例: `v0.2.0`）が作成される
   - **GitHub Release** が作成され、リリースノートが記載される
5. その後、**Deploy Production** など既存の main 向け CI が走り、ビルド時に `package.json` の version がフロントに注入され、設定画面に表示される。

## 関連ファイル

- `.release-please-config.json` — Release Please の設定（release-type: node、packages、changelog セクションなど）
- `.release-please-manifest.json` — 現在のリリース済みバージョンを管理する manifest
- `.github/workflows/release-please.yml` — main への push で Release Please を実行
- `package.json` — ルートの `version` が Release Please により更新される
- `CHANGELOG.md` — Release Please が自動生成・更新（初回は手動で作成してもよい）。Prettier との競合を防ぐため `.prettierignore` で除外している。
- フロント: ビルド時に `VITE_APP_VERSION` として `package.json` の version を注入し、一般設定の「アプリについて」で表示

## 初回セットアップ（未作成の場合）

- `CHANGELOG.md` が無い場合、Release Please が初回の Release PR で作成する。既存の `CHANGELOG.md` がある場合はその形式に合わせて追記される。
- `.release-please-manifest.json` に現在のリリース済みバージョン（例: `0.1.0`）を記録しておく。
- `package.json` の `version` は Release PR 作成時に Release Please により更新される。

## 参考

- [Release Please](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
