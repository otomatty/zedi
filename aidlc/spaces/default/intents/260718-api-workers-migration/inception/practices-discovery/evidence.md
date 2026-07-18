# Evidence — Practices Discovery (2026-07-18)

Brownfield scan: 4 parallel read-only agents. Reverse-engineering artifacts were not consumed (infra scope skips that stage); agents scanned the repo directly. Interview covered only the 5 gaps evidence could not resolve (`practices-discovery-questions.md`).

## aidlc-pipeline-deploy-agent (lead) — branching / CI / deployment

- **Scanned**: `git log` / `git branch -a`, `.github/workflows/*` (ci, deploy-dev, deploy-prod, sync-main-to-develop, release-please, nightly-mutation ほか), `server/*/wrangler.jsonc`, AGENTS.md.
- **Inferred**: GitFlow 系 `develop`+`main`。feature PR は squash、`main`↔`develop` 同期は merge commit 固定（`sync-main-to-develop.yml` が自動化）。`develop`→dev / `main`→prod の push 駆動デプロイ。フロント/admin は Cloudflare Pages、server/* は Railway 暫定稼働で Workers 移行中（#1088、dev Worker のみ先行、prod Worker デプロイ未整備、hocuspocus は wrangler.jsonc 無し）。
- **Asked**: 本番デプロイの手動承認有無（Q3 → 完全自動）。

## aidlc-quality-agent — testing posture

- **Scanned**: AGENTS.md TDD 節、テストファイル分布（src/ colocated 262 件、server/api `__tests__` ミラー約 146 件）、`stryker.config.mjs`（break:70）、`nightly-mutation.yml`（break:null 観測のみ）、`playwright.config.ts` + `e2e/`（バックエンドレスモック）、`.github/rulesets/main-develop-branch-protection.json`。
- **Inferred**: TDD 必須ドクトリン、Mutation 第一指標、配置ルールはドキュメントと実態が一致。coverage 80% は機械強制なし。
- **Asked**: required status checks の実態（Q4 → GitHub 側で構成済み）、coverage の位置づけ（Q5 → 目標値のまま）。

## aidlc-developer-agent — code patterns

- **Scanned**: AGENTS.md 命名/配置規則、`src/hooks`・`src/components`・`server/api/src` ツリー、`middleware/errorHandler.ts`、`routes/lint.ts`、import パターン grep（`@zedi/*` 322 hits、HTTPException 系 450 hits）。
- **Inferred**: 命名規則にドリフト無し。server/api は routes/services/lib/schema 4 層、例外ベース（HTTPException + グローバル onError、`{ error: string }` 封筒、5xx マスク）。`server/*` は workspace 外で `@zedi/shared` 直 import 不可 → 二重定義 + ドリフトテスト。
- **Open**: ドリフトテストのカバー範囲の広さ（ドキュメント上の例は 1 件）— 影響軽微のため質問せず記録のみ。

## aidlc-devsecops-agent — lint / security / secrets

- **Scanned**: `eslint.config.js`（flat、ts-eslint strict）、`.prettierrc`、ci.yml security ジョブ（gitleaks SHA ピン、npm-audit 非ブロッキング）、`.github/dependabot.yml`（週次、develop ターゲット）、`dependabot-bun-lock.yml`、`putWorkerSecrets.ts`（`wrangler secret bulk`）、`.env*` の gitignore 状態。
- **Inferred**: SAST/DAST 無し（gitleaks + npm-audit のみ）。Actions は commit SHA ピン留め。secrets は GitHub encrypted secrets + wrangler secret で、実 env ファイルは未追跡。`BETTER_AUTH_SECRET` は API/MCP 間で値共有（パリティの自動強制なし）。
- **Open**: dependabot.yml に server/mcp と admin が無いのは意図的か — 影響軽微のため質問せず記録のみ。

## Interview (Q1-Q5 summary)

| Q | Gap | Answer |
|---|-----|--------|
| Q1 | チーム構成 | ソロ + AI エージェント（自己承認 + AI レビュー） |
| Q2 | Walking skeleton | 常に実施 |
| Q3 | 本番承認ゲート | 完全自動 |
| Q4 | required checks | GitHub 側で構成済み |
| Q5 | coverage 80% | 目標値のまま（Mutation 第一指標） |
