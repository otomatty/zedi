# Dependabot オープンPR 一覧とマージ方針

**作成日:** 2026-03-03  
**更新日:** 2026-03-09（#282–#290 一覧に更新、方針B 実施メモ追加）  
**対象リポジトリ:** otomatty/zedi  
**ベースブランチ:** develop

## 1. オープンPR一覧（2026-03-09 時点: #282–#290・いずれも Dependabot）

| #   | パッケージ                | 変更              | スコープ   | 備考                          |
| --- | ------------------------- | ----------------- | ---------- | ----------------------------- |
| 290 | eslint                    | 9.39.4 → 10.0.3   | ルート     | **major**（ESLint 10）※別対応 |
| 289 | recharts                  | 2.15.4 → 3.8.0    | ルート     | **major**（チャート UI）      |
| 288 | @types/node               | 24.12.0 → 25.3.5  | ルート     | major（型のみ）               |
| 287 | wrangler                  | 3.114.17 → 4.71.0 | ルート     | **major**（Cloudflare CLI）   |
| 286 | lucide-react              | 0.576.0 → 0.577.0 | ルート     | patch（minor-and-patch）      |
| 285 | @polar-sh/sdk             | 0.45.2 → 0.46.3   | server/api | minor（minor-and-patch）      |
| 284 | hashicorp/setup-terraform | 3 → 4             | .github    | **major**（Terraform CI）     |
| 283 | actions/setup-node        | 4 → 6             | .github    | **major**                     |
| 282 | actions/checkout          | 4 → 6             | .github    | **major**                     |

- **ルート** = リポジトリ直下の `package.json` + `bun.lock`
- **server/api** = `server/api/package.json` + `server/api/bun.lock`（別 lockfile のためルートと競合しない）
- **.github** = `.github/workflows/*.yml`（GitHub Actions）
- ※ **#290 (eslint 10)** は一括PRでは取り込まず、ESLint 10 の設定読み込みエラー（`ERR_INTERNAL_ASSERTION`）解消後に別PRで対応する想定。

---

## 2. マージ時の注意点

1. **ルートの8本は同じ `package.json` / `bun.lock` を触る**  
   同時に複数マージするとコンフリクトするため、「1本マージ → develop を更新 → 次のPRを develop にリベース/更新」の順で進める必要があります。

2. **Dependabot ブランチは作成時点の develop がベース**  
   1本マージするたびに、残りのPRは「Update branch」または `@dependabot rebase` で最新 develop を取り込まないとコンフリクトまたは古い lock のままになります。

3. **major アップデート**  
   react-day-picker (8→9)、eslint-plugin-react-hooks (5→7)、@types/node (22→25) などは破壊的変更や型・ルール変更の可能性があるため、マージ後にビルド・テスト・Lint の確認を推奨します。

---

## 3. 推奨マージ方針

### 方針A: 1本ずつ順番にマージ

CI が通っている前提で、以下の順でマージすることを推奨します。

**グループ1: GitHub Actions**

| 順  | PR                                     | 理由                                         |
| --- | -------------------------------------- | -------------------------------------------- |
| 1   | **#282** actions/checkout 4→6          | 使用箇所が多く他ワークフローの前提になりうる |
| 2   | **#283** actions/setup-node 4→6        | 同上。マージ後に #284 を Update branch       |
| 3   | **#284** hashicorp/setup-terraform 3→4 | Terraform 用。v4 の breaking change 要確認   |

**グループ2: server/api**

| 順  | PR                     | 理由                            |
| --- | ---------------------- | ------------------------------- |
| 4   | **#285** @polar-sh/sdk | server/api のみ。minor で影響小 |

**グループ3: ルート npm（1本ずつ + 都度 Update branch）**

| 順  | PR                    | 理由                                                                                  |
| --- | --------------------- | ------------------------------------------------------------------------------------- |
| 5   | **#286** lucide-react | patch。影響が最も小さい                                                               |
| 6   | **#288** @types/node  | 型定義のみ。型エラーが出たら対応                                                      |
| 7   | **#289** recharts     | major。チャート利用箇所のビルド・表示確認                                             |
| 8   | **#290** eslint       | major。設定・ルール変更の可能性。`bun run lint` 必須（※ESLint 10 は環境により要検証） |
| 9   | **#287** wrangler     | major。Cloudflare デプロイ・ローカル確認が必要なら最後に                              |

**各マージ後:** 次のPRで GitHub の「Update branch」を実行するか、`@dependabot rebase` とコメントしてからマージする。

---

### 方針B: 一括更新PRでまとめて対応（2026-03-09 実施）

Dependabot のPRをクローズし、1本の「chore(deps): update dependencies and GitHub Actions」PRにまとめる方法です。

**2026-03-09 実施内容（ブランチ `chore/deps-dependabot-batch`）**

1. `develop` から `chore/deps-dependabot-batch` を作成
2. **GitHub Actions:** `actions/checkout@v4`→`@v6`、`actions/setup-node@v4`→`@v6`、`hashicorp/setup-terraform@v3`→`@v4` に更新
3. **ルート:** recharts 3.8.0、@types/node 25.3.5、wrangler 4.71.0、lucide-react 0.577.0 を導入。eslint は 10 で設定読み込みエラーが発生したため **9.39.4 のまま**（#290 は別PRで対応）
4. **server/api:** @polar-sh/sdk 0.46.3 を導入
5. `bun run build` / `bun run test:run` / `bun run lint` を実行して通過を確認
6. 本PRマージ後、Dependabot の #282–#289 をクローズ。#290 (eslint 10) は必要に応じて別途対応

**メリット:** コンフリクトを一括で解消でき、履歴が1本にまとまる。  
**デメリット:** 問題が出たときにどのパッケージが原因か切り分けが必要。

---

## 4. マージ前の共通確認

- [ ] 対象PRの CI（lint-and-test 等）が成功していること
- [ ] マージ後: ルートで `bun run build` が通ること
- [ ] マージ後: `bun run test:run` が通ること
- [ ] マージ後: `bun run lint` が通ること（とくに eslint 更新後）
- [ ] #289 (recharts) マージ後: チャートを使う画面の表示確認（必要に応じて）
- [ ] #287 (wrangler) マージ後: Cloudflare 関連のビルド・デプロイ確認（必要に応じて）

---

## 5. 参考リンク

- [GitHub PR 一覧](https://github.com/otomatty/zedi/pulls?q=is%3Apr+is%3Aopen+author%3Aapp%2Fdependabot)
- Dependabot コマンド: PR に `@dependabot rebase` とコメントすると、ベースブランチの最新を取り込んでリベースします。
