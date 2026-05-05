# `claude-analyze` action

Sentry が検知した API エラーを Claude (Anthropic) で解析し、構造化 JSON を Zedi
API のコールバックに `PUT` する composite action。Epic [#616](https://github.com/otomatty/zedi/issues/616)
Phase 2 / Issue [#806](https://github.com/otomatty/zedi/issues/806) の実装。

Composite action that asks Claude to analyze a Sentry-reported API error and
PUTs the validated structured result back to the Zedi API callback. Implements
Epic [#616](https://github.com/otomatty/zedi/issues/616) Phase 2 / issue
[#806](https://github.com/otomatty/zedi/issues/806).

---

## ファイル構成 / Files

| ファイル / file             | 役割 / role                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `action.yml`                | composite action 定義 / composite action definition              |
| `analyze.mjs`               | Claude を呼んで JSON を生成するスクリプト / Claude orchestrator  |
| `schema.mjs`                | Zod 出力スキーマ / output schema (mirrors API)                   |
| `prompt.md`                 | Claude へのプロンプトテンプレ / prompt template                  |
| `__tests__/schema.test.mjs` | 出力スキーマ fixture テスト / fixture tests for the schema       |
| `__tests__/fixtures/*.json` | 有効・無効ペイロードのサンプル / valid + invalid sample payloads |

呼び出し元 / called from: `.github/workflows/analyze-error.yml`.

---

## `repository_dispatch` の `client_payload` 契約 / Dispatch contract

API 側 (`server/api/src/routes/webhooks/sentry.ts`) は `event_type: analyze-error`
で次のペイロードを発火する:

```json
{
  "api_error_id": "uuid — api_errors.id",
  "sentry_issue_id": "Sentry の group.id 文字列",
  "title": "1〜2行のエラータイトル",
  "route": "POST /api/... or null"
}
```

Action 側で必須なのは `api_error_id`, `sentry_issue_id`, `title` の 3 つ。`route`
は空でも構わない（API のスキーマ的にも nullable）。

The API webhook fires `event_type: analyze-error` with the payload shape above.
Only `api_error_id`, `sentry_issue_id`, and `title` are required on the action
side; `route` is allowed to be empty (the API column is nullable).

---

## 必要な secrets / Required secrets

ワークフロー (`analyze-error.yml`) が読み取るリポジトリ secrets:

| name                         | 用途 / purpose                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`          | Claude API 呼び出し                                               |
| `GITHUB_APP_ID`              | App ID (P2-1 と共有 / shared with P2-1)                           |
| `GITHUB_APP_PRIVATE_KEY`     | App private key (PKCS#8 PEM)                                      |
| `AI_ERROR_CALLBACK_BASE_URL` | API のベース URL (`https://api.example.com`) — 末尾スラッシュなし |

`GITHUB_APP_INSTALLATION_ID` は Action 側では使わない（installation token は
`actions/create-github-app-token@v2` が App ID から自動解決する）。
The action does not need `GITHUB_APP_INSTALLATION_ID` directly — the installation
token is resolved automatically by `actions/create-github-app-token@v2`.

---

## 出力 JSON スキーマ / Output JSON schema

Anthropic から得たテキストは `schema.mjs` の Zod スキーマで検証される。サーバ側
`updateAiAnalysis` (`server/api/src/services/apiErrorService.ts`) と同じ境界を
持たせている。

```jsonc
{
  "severity": "high | medium | low | unknown", // 必須 / required
  "ai_summary": "1-2 文 / one or two sentences", // 必須 / required
  "ai_root_cause": "string | null", // 任意 / optional
  "ai_suggested_fix": "string | null", // 任意 / optional
  "ai_suspected_files": [
    // 任意・最大 5 件 / optional, max 5
    { "path": "repo-relative", "reason": "string?", "line": 42 },
  ],
}
```

スキーマに合わない応答（severity が enum 外、`ai_summary` 欠落、`ai_suspected_files`
の `path` 空、未知のトップレベルキー、等）は CI 段階で `parseAndValidate` が throw
してジョブが赤くなる。API には書き戻されない（fire-and-forget の "失敗" 扱い）。

Responses that violate the schema (out-of-enum severity, missing `ai_summary`,
empty suspected-file `path`, unknown top-level keys, …) cause `parseAndValidate`
to throw at the CI step. Nothing is written back to the API — Epic #616's
"AI failure must not affect end-user requests" guarantee is preserved by
treating these as hard CI failures rather than partial writes.

---

## ローカルでスキーマ検証 / Validate the schema locally

Node 24 の組み込みテストランナーで動く（vitest 不要）。

Runs on Node 24's built-in test runner — no vitest needed.

```bash
node --test .github/actions/claude-analyze/__tests__/schema.test.mjs
```

新しいシナリオを追加するときは `__tests__/fixtures/` に JSON を置いて、`schema.test.mjs`
にケースを 1 つ足す。

To add a new scenario, drop a fixture JSON in `__tests__/fixtures/` and add one
test case in `schema.test.mjs`.

---

## ローカルで analyze.mjs をドライラン / Local dry-run of analyze.mjs

Anthropic 呼び出しを skip して固定 stub を返す。プロンプト生成と grep 抜粋の挙動を
確認できる。

Skips the Anthropic call and returns a fixed stub. Lets you eyeball the prompt
context and grep-keyword behavior without burning API credits.

```bash
CLAUDE_ANALYZE_API_ERROR_ID=00000000-0000-0000-0000-000000000001 \
CLAUDE_ANALYZE_SENTRY_ISSUE_ID=fixture-1 \
CLAUDE_ANALYZE_TITLE="TypeError: Cannot read property 'note_id' of null in pageService" \
CLAUDE_ANALYZE_ROUTE="GET /api/pages/:id" \
CLAUDE_ANALYZE_REPOSITORY=otomatty/zedi \
ANTHROPIC_API_KEY=unused-in-dry-run \
CLAUDE_ANALYZE_DRY_RUN=true \
CLAUDE_ANALYZE_OUTPUT=/tmp/analyze-dryrun.json \
node .github/actions/claude-analyze/analyze.mjs

cat /tmp/analyze-dryrun.json
```

実 API キーで Claude を呼び出して試したい場合は `CLAUDE_ANALYZE_DRY_RUN=false` に
して、`ANTHROPIC_API_KEY` に本物のキーを渡す。

To exercise the real Claude call, set `CLAUDE_ANALYZE_DRY_RUN=false` and use a
real `ANTHROPIC_API_KEY`.

---

## CI で end-to-end を試す / End-to-end dry-run via workflow_dispatch

`workflow_dispatch` 入力には `dry_run` (Anthropic 呼び出しスキップ) と `skip_callback`
(API への PUT スキップ) が用意されている。両方 true がデフォルトなので、secrets
未配備のリポジトリでもパイプラインが赤くならずに通るか確認できる。

The workflow exposes `dry_run` (skip Anthropic) and `skip_callback` (skip API
PUT) inputs, both defaulting to `true`. Useful in repositories where the
secrets are not yet provisioned — the action chain runs green end-to-end
without touching external services.

GitHub UI からの手動起動例 / Manual run via GitHub UI:

1. **Actions** → **Analyze API error** → **Run workflow**
2. 入力 / inputs:
   - `api_error_id`: `00000000-0000-0000-0000-000000000001`
   - `sentry_issue_id`: `fixture-1`
   - `title`: `TypeError: Cannot read property 'note_id' of null in pageService`
   - `route`: `GET /api/pages/:id`
   - `dry_run`: ✅ true
   - `skip_callback`: ✅ true
3. Run — analyze step が JSON を吐き、callback step がスキップされて緑になる。

`dry_run=false` + `skip_callback=true` にすると Claude を実際に呼ぶが、API への
PUT は行わない（プロンプト品質チェック用）。`dry_run=false` + `skip_callback=false`
は本番経路と同じで、`AI_ERROR_CALLBACK_BASE_URL` と GitHub App secrets が必要。

`dry_run=false` + `skip_callback=true` invokes Claude for real but does not
PUT to the API — useful for prompt-quality smoke tests. The fully live combo
(`dry_run=false` + `skip_callback=false`) requires `AI_ERROR_CALLBACK_BASE_URL`
and the GitHub App secrets to be configured.

---

## リトライ・失敗時の挙動 / Retry & failure semantics

| 失敗箇所 / failure point          | 挙動 / behavior                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Anthropic API (5xx / network)     | `analyze.mjs` 側で 2 試行まで（5 秒間隔）/ 2 attempts inside the script            |
| 出力 JSON 検証失敗                | `parseAndValidate` が throw → ジョブ失敗、API には書き戻さない / job fails, no PUT |
| API callback 5xx / network        | composite action の curl ループで 2 試行まで（5 秒間隔）/ 2 attempts in shell      |
| API callback 4xx (auth / payload) | 即時失敗（リトライしない）/ immediate failure (no retry)                           |

いずれの失敗もユーザーリクエストには影響しない（Epic #616 の不変条件）。Sentry
webhook 側は `triggerRepositoryDispatch().catch(log)` で発火しているので、本ワーク
フローが完全に未デプロイでも API はデグレしない。

None of these failures cascade to user-facing requests (Epic #616 invariant).
The Sentry webhook detaches `triggerRepositoryDispatch().catch(log)`, so even
a fully-undeployed workflow does not degrade the API.
