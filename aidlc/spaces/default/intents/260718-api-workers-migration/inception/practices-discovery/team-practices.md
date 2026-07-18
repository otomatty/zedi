# Team Practices — Zedi

## Way of Working

ソロ開発者（otomatty）+ AI エージェント（Claude Code / Cursor / Codex / Dependabot）の体制。PR ベースで開発し、レビューは自己承認 + AI レビューの組み合わせ（ブランチ保護は PR 承認 1 件）。ブランチは `feature/…`・`fix/…`・`hotfix/…`・`chore/…`（Issue 番号命名可）、PR タイトルは Conventional Commits で release-please の semver を駆動する。feature PR は squash で `develop` に取り込み、`main` ↔ `develop` の同期のみ必ず merge commit（squash 禁止）。

## Walking Skeleton

常に実施する。新規機能・インフラ移行のいずれでも、最初に最薄のエンドツーエンドスライスを通して統合点を先に証明してから残りを作り込む。

## Testing Posture

TDD（Red → Green → Refactor）が必須で、実装後のテスト後付けと「写し絵テスト」は禁止。第一品質指標は Mutation score（Stryker、PR は `mutation-light` break:70、golden list 目標 85%+）で、行カバレッジ 80% は目標値であり機械強制しない。テスト配置は `src/` 等が同居（colocated）、`server/api`・`server/mcp` は `src/__tests__/` ミラー（同居禁止）。E2E は Playwright（バックエンドレス、モック駆動）。CI のテストジョブは GitHub 側の required status checks としてマージ要件になっている。

## Deployment

`develop` → dev 環境、`main` → prod 環境の push 駆動・完全自動デプロイ（手動承認ゲートなし）。フロント/admin は Cloudflare Pages、`server/*` は暫定 Railway で、Cloudflare Workers への移行が進行中（#1088。dev 用 Worker デプロイのみ先行、構成の正本は各 `wrangler.jsonc`、Terraform は廃止予定）。DB マイグレーションは deploy ワークフロー内の `drizzle-kit migrate` のみが本番に効く。本番フロント切替は `/api/health` の commit SHA 一致で gate。

## Code Style

ESLint flat config（typescript-eslint strict）+ Prettier（幅 100、ダブルクォート）。命名はドメインディレクトリ camelCase（kebab-case 禁止、例外は `packages/ui` の shadcn）、コンポーネント PascalCase、フックは `use*` で `src/hooks/` のみ。`server/api` は routes / services / lib / schema の 4 層分離で、エラーは HTTPException + グローバル `onError` の `{ error: string }` 封筒に統一（5xx は内部情報を漏らさない）。`server/*` は workspace 外のため `@zedi/shared` の値をサーバ内に二重定義し、ドリフトテストで文字列一致を検証する。
