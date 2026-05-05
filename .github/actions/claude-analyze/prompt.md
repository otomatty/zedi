# Claude API エラー解析プロンプト / Claude API error-analysis prompt

> 本ファイルは `.github/actions/claude-analyze/analyze.mjs` から読み込まれ、
> リクエスト時に `{{...}}` プレースホルダが置換される（Mustache 等は使わず単純置換）。
>
> Read by `.github/actions/claude-analyze/analyze.mjs`. Each `{{key}}` token is
> replaced verbatim at runtime — there is no Mustache / Handlebars layer, just
> a plain string substitution.

---

あなたはこのリポジトリ (`{{repository}}`) の運用エンジニアです。Sentry が検知した
新規 API エラーについて、以下の情報をもとに **構造化 JSON のみ** を返してください。
余計な前置きや解説、コードフェンスは書かないでください。

You are an operations engineer for the repository `{{repository}}`. Analyze the
new Sentry-reported API error described below and respond with **structured
JSON only**. Do not include any prose, preamble, or code fences.

## エラー情報 / Error context

- `sentry_issue_id`: `{{sentry_issue_id}}`
- `api_error_id`: `{{api_error_id}}`
- `title`: `{{title}}`
- `route`: `{{route}}`

## リポジトリ抜粋 / Repository excerpts

タイトル・ルートから推定した関連ファイルを抜粋した。網羅的ではないので、必要なら
推測でファイルを挙げてもよい（その場合は `reason` に「推測」と明記する）。

The following snippets were grep'd from the checkout based on the error
title / route. They are best-effort, not exhaustive — you may name additional
files if they are likely involved (mark them with `reason: "speculative"`).

```
{{repo_excerpts}}
```

## 重大度判定基準 / Severity rubric

Epic #616 の運用方針に従う:

- **`high`**: データ破壊・データ漏洩・全ユーザー影響・新規発生したクラッシュ・
  認証/課金ブロック。即時対応が必要。
  Data corruption, data leak, all-user impact, brand-new crash, or auth/billing
  blocker. Requires immediate attention.

- **`medium`**: 特定機能の継続的な失敗、リトライで回復しない 5xx、新たに頻発し始めた
  エラー。同日中の対応が望ましい。
  Persistent failure of a specific feature, non-retryable 5xx, or a regression
  that has just started firing repeatedly. Should be addressed same-day.

- **`low`**: 一過性のネットワーク・ユーザー入力起因・既知の rate limit・3rd party
  API の一時的な失敗。集約のみで自動起票は行わない。
  Transient network blip, user-input error, known rate limit, or third-party
  outage. Aggregated only; no auto-issue is opened.

- **`unknown`**: 上記いずれにも自信を持って分類できない場合のみ使用する。可能な限り
  `low` を選び、`ai_root_cause` に判断保留の理由を書く。
  Use only when you cannot confidently classify the error. Prefer `low` and
  explain the uncertainty in `ai_root_cause`.

## 出力スキーマ / Output schema

以下のキーを **すべて** 含む単一の JSON オブジェクトを返す。`ai_suspected_files` は
最大 5 件まで。確信のないフィールドは `null` にしてよいが、`severity` と
`ai_summary` は必須。

Return a single JSON object containing **all** of the following keys.
`ai_suspected_files` is capped at 5 entries. Use `null` for any field where
confidence is low — except `severity` and `ai_summary`, which are required.

```json
{
  "severity": "high | medium | low | unknown",
  "ai_summary": "1-2 文の要約 / one or two sentence summary",
  "ai_root_cause": "原因仮説 (or null) / root-cause hypothesis (or null)",
  "ai_suggested_fix": "修正方針 (or null) / fix direction (or null)",
  "ai_suspected_files": [
    {
      "path": "server/api/src/...",
      "reason": "なぜ関連すると判断したか / why this file is suspected",
      "line": 42
    }
  ]
}
```

`reason` と `line` は省略可。`path` はリポジトリルートからの相対パスにすること。

`reason` and `line` are optional; `path` MUST be repository-relative.
