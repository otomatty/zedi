# `setup-toolchain` action

リポジトリの CI ワークフローで繰り返し使われる「Node → Bun → bun install」を
1 つの composite action にまとめ、GitHub API の一過性失敗（典型:
`oven-sh/setup-bun@v2` が `api.github.com/repos/oven-sh/bun/git/refs/tags` で
401 を返す等）に自動でリトライをかける。Issue
[#937](https://github.com/otomatty/zedi/issues/937) で導入。

Composite action that bundles the repository's standard CI setup (Node +
Bun + `bun install`) and wraps the GitHub API-dependent steps with retry
semantics. Targets the transient `setup-bun` / `bun install` failures
captured in Issue [#937](https://github.com/otomatty/zedi/issues/937)
(e.g. one-shot 401 from `api.github.com`).

---

## ⚠️ `actions/checkout` は caller 側 / `actions/checkout` belongs to the caller

ローカル composite action の `action.yml` は **リポジトリが workspace に
checkout された後** でないと解決できない。本 action 内部に
`actions/checkout` を含めると chicken-and-egg になるので、caller が先に
`actions/checkout` を実行する必要がある。**checkout 自体も Issue #937 で
flake が観測されている**ため、caller 側でも `Wandalen/wretry.action@v3`
でラップすることを推奨する（後述のテンプレ参照）。

GitHub Actions resolves a local composite action by reading its `action.yml`
**from the workspace, which only exists after `actions/checkout`**. The
composite cannot bootstrap itself, so callers must check out first.
Because checkout itself has been observed to flake (see Issue #937),
callers should wrap `actions/checkout` with `Wandalen/wretry.action@v3`
(template below).

---

## ファイル構成 / Files

| ファイル / file | 役割 / role                                            |
| --------------- | ------------------------------------------------------ |
| `action.yml`    | composite action 定義 / composite action definition    |
| `README.md`     | 使用方法・引数の文書化 / usage and input documentation |

呼び出し元 / called from: `.github/workflows/ci.yml`,
`.github/workflows/deploy-dev.yml`, `.github/workflows/deploy-prod.yml`,
`.github/workflows/nightly-mutation.yml`.

---

## なぜ必要か / Why

CI の各ジョブは `${{ github.token }}` を使う JS アクション
（`actions/checkout` / `actions/setup-node` / `oven-sh/setup-bun`）を独立に
実行する。GitHub バックエンド側の一時的な 401 / 5xx でジョブごとに**ランダム
に 1 つだけ落ちる**事象が観測された（Issue #937、PR #936 の run 1b0dc51 /
c5694c1 を参照）。ワークフロー自身にはリトライ機構が無く、コードに問題が
無くても手動 re-run が必要になる。

本 composite action は内部で
[`Wandalen/wretry.action@v3`](https://github.com/Wandalen/wretry.action)
を使い、`setup-node` / `setup-bun` を `attempt_limit: 3` /
`attempt_delay: 5000ms` でラップする。`bun install` も shell レベルでの
リトライ（5s → 10s バックオフ、最大 3 回）を持つ。通常は 1 発で成功するため
オーバーヘッドは数秒以内に収まる想定。

Each CI job independently invokes JS actions (`actions/checkout` /
`actions/setup-node` / `oven-sh/setup-bun`) that authenticate against the
GitHub API with `${{ github.token }}`. When the GitHub backend returns a
transient 401 / 5xx, **a random single job per PR fails at setup**
(see Issue #937 — PR #936 runs 1b0dc51 / c5694c1). There is no built-in
retry, so contributors had to manually re-run unaffected code.

This action wraps `setup-node` / `setup-bun` with
[`Wandalen/wretry.action@v3`](https://github.com/Wandalen/wretry.action)
(`attempt_limit: 3`, `attempt_delay: 5000ms`) and adds shell-level retry
for `bun install` (5s → 10s backoff, up to 3 attempts). The happy path
still completes on the first attempt, so overhead in the steady state is
just a few seconds.

---

## 使用例 / Usage

### 1. 標準ジョブ / Standard job (root install)

ほとんどの CI ジョブはこのテンプレで置き換え可能。checkout / Node / Bun /
`bun install --frozen-lockfile` すべてがリトライ付きで実行される。

Most CI jobs can use this two-block template. Checkout / Node / Bun /
root `bun install --frozen-lockfile` all run with retry.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout (with retry)
        uses: Wandalen/wretry.action@v3
        with:
          action: actions/checkout@v7.0.0
          attempt_limit: 3
          attempt_delay: 5000

      - uses: ./.github/actions/setup-toolchain

      - run: bun run lint
```

### 2. 履歴が必要なジョブ / Jobs that need full git history

PR のベースとの diff を取る `drizzle-migration-check` や `security` などは
checkout の `with:` で `fetch-depth: 0` を渡す。

Jobs that diff against the PR base (e.g. `drizzle-migration-check` /
`security`) pass `fetch-depth: 0` to the inner checkout:

```yaml
steps:
  - name: Checkout (with retry)
    uses: Wandalen/wretry.action@v3
    with:
      action: actions/checkout@v7.0.0
      with: |
        fetch-depth: 0
      attempt_limit: 3
      attempt_delay: 5000

  - uses: ./.github/actions/setup-toolchain
```

### 3. Node のみのジョブ / Node-only jobs

`drizzle-migration-check` / `drizzle-schema-drift-check` のように Node
スクリプトだけ動かすジョブは `setup-bun: "false"` を渡せば Bun のセット
アップと `bun install` を丸ごとスキップできる。

Node-only jobs (e.g. `drizzle-migration-check` /
`drizzle-schema-drift-check`) can skip the Bun setup and the root install
entirely:

```yaml
steps:
  - name: Checkout (with retry)
    uses: Wandalen/wretry.action@v3
    with:
      action: actions/checkout@v7.0.0
      attempt_limit: 3
      attempt_delay: 5000

  - uses: ./.github/actions/setup-toolchain
    with:
      setup-bun: "false"
```

### 4. ワークスペース個別 install / Workspace-only install

`server/mcp` のようにルートでは install せず特定ワークスペースだけ install
するジョブは `install-deps: "false"` を渡し、後段で個別に install する。

For jobs that skip the root install and instead install inside a specific
workspace (e.g. `server/mcp`):

```yaml
steps:
  - name: Checkout (with retry)
    uses: Wandalen/wretry.action@v3
    with:
      action: actions/checkout@v7.0.0
      attempt_limit: 3
      attempt_delay: 5000

  - uses: ./.github/actions/setup-toolchain
    with:
      install-deps: "false"

  - name: Install MCP dependencies
    working-directory: server/mcp
    run: bun install --frozen-lockfile
```

---

## 入力 / Inputs

| name           | required | default  | 説明 / description                                                                                                                                                                                                           |
| -------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup-bun`    | no       | `"true"` | `"false"` で Bun のセットアップと `bun install` を丸ごとスキップ。 / Set to `"false"` to skip Bun setup and the root install entirely.                                                                                       |
| `bun-version`  | no       | `"1.3"`  | `oven-sh/setup-bun` に渡す Bun のバージョン指定子。 / Bun version spec forwarded to `oven-sh/setup-bun`.                                                                                                                     |
| `install-deps` | no       | `"true"` | `"false"` でルートの `bun install --frozen-lockfile` をスキップ。`setup-bun: "false"` のときは実質無効。 / Set to `"false"` to skip the root `bun install --frozen-lockfile`. Implicitly disabled when `setup-bun: "false"`. |

`actions/checkout` の `fetch-depth` などは caller 側で `Wandalen/wretry.action`
の `with:` に渡す（上記サンプル参照）。`fetch-depth` などのパラメータは
本 composite action では扱わない。

`actions/checkout` arguments (`fetch-depth`, etc.) are passed by the caller
on the `Wandalen/wretry.action` block — they are not inputs of this
composite action (see samples above).

---

## リトライ仕様 / Retry semantics

| ステップ / step                 | リトライ実装 / retry mechanism          | 試行回数 / attempts | 待機 / delay                                |
| ------------------------------- | --------------------------------------- | ------------------- | ------------------------------------------- |
| `actions/checkout@v7.0.0`       | caller 側 / `Wandalen/wretry.action@v3` | 3                   | 5000 ms                                     |
| `actions/setup-node@v6`         | `Wandalen/wretry.action@v3`             | 3                   | 5000 ms                                     |
| `oven-sh/setup-bun@v2`          | `Wandalen/wretry.action@v3`             | 3                   | 5000 ms                                     |
| `bun install --frozen-lockfile` | shell 内ループ / inline shell loop      | 3                   | 5s → 10s（線形バックオフ / linear backoff） |

3 回全てが失敗した場合はステップ／ジョブを失敗させる。通常は 1 回目で成功
するためステップ時間はほぼ増えない。If all attempts fail, the step exits
non-zero — expected to be rare since the steady-state path succeeds on the
first try.

---

## 外部依存 / External dependencies

- [`Wandalen/wretry.action@v3`](https://github.com/Wandalen/wretry.action)
  — `uses:` 形式のアクションをリトライ付きで実行する composite ラッパー。
  Dependabot の `github-actions` ecosystem 対象（既存設定で自動更新）。
  / Composite wrapper that retries `uses:`-style actions. Tracked by the
  repository's existing `github-actions` Dependabot configuration.

シェルレベルのコマンドリトライには既に `nick-fields/retry@v4` を使っているが
（`deploy-*.yml`）、本 action のターゲットは `uses:` の JS アクションなので
`wretry` のほうが適切。

`nick-fields/retry@v4` is already used elsewhere for shell-command retries
(`deploy-*.yml`), but it cannot wrap `uses:` invocations — hence `wretry`.

---

## 関連 / References

- Issue [#937](https://github.com/otomatty/zedi/issues/937) — 本 action の
  導入経緯 / origin issue
- PR [#936](https://github.com/otomatty/zedi/pull/936) — 再現事象の出元 /
  source of the observed flake
- [`oven-sh/setup-bun` README](https://github.com/oven-sh/setup-bun) —
  `token` input は `${{ github.token }}` がデフォルト
- [`actions/runner#4295`](https://github.com/actions/runner/issues/4295)
  — `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 関連の既知問題（Issue #937
  Proposal B として今後再評価）
