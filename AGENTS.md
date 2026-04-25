# Zedi - AI Agent Guidelines

プロジェクト全体の AI エージェント向け共通ガイドライン。
Cursor, Claude Code, GitHub Copilot, Codex 等すべてのエージェントが参照する。

## 仕様・ドキュメント（最重要） / Specification & documentation (critical)

- **仕様の正（source of truth）はコードの TSDoc / JSDoc とテスト**。詳細は [`SPECIFICATION_POLICY.md`](SPECIFICATION_POLICY.md)。  
  _Source of truth: TSDoc/JSDoc and tests; see SPECIFICATION_POLICY.md._
- **Git に追跡させない** — `.gitignore` で `docs/` およびルートの `journal/` を除外する。長文の仕様・メモをリモートに載せない。  
  _Do not track long-form prose: `docs/` and root `journal/` are gitignored._
- **ローカル専用の `docs/`** — 調査・下書き・作業ログ用に、追跡されない `docs/` 以下へファイルを置いてよい（構成は下記「ローカル専用メモ」）。これらは契約や CI の根拠にはしない。  
  _Optional local-only `docs/` for drafts and notes; not contract or CI truth._
- **不要になった説明は削除する**（ローカルファイル含む）。エージェントに古い文面を渡さず、コンテキストを浪費しない。  
  _Delete obsolete explanations (including local files) to avoid stale context._
- **`docs/` を勝手に読まない**。ユーザーが `@ファイル` で添付したファイルは読む（`.cursor/rules/specification-and-docs.mdc`）。  
  _Do not browse `docs/` unless the user attaches a file via `@`._

## 技術スタック

- **フロント**: React, TypeScript, Vite
- **ランタイム**: Bun
- **API**: `server/api`（Hono on Bun）
- **リアルタイム**: `server/hocuspocus`（Y.js 同期サーバー）
- **MCP サーバー**: `server/mcp`（Claude Code 等の外部 MCP クライアントに Zedi のページ・ノート・検索を公開する。stdio / HTTP 両対応。詳細は [`server/mcp/README.md`](server/mcp/README.md)）  
  _MCP server exposing Zedi data to external MCP clients (stdio + HTTP); see `server/mcp/README.md`._
- **管理画面**: `admin/`（Vite + React + Tailwind）
- **Lint**: ESLint, Prettier
- **テスト**: Vitest（単体）, Playwright（E2E）
- **インフラ**: Terraform（Cloudflare）, Railway, GitHub Actions

## ビルド・テスト

```bash
bun install            # 依存インストール
bun run dev            # API + フロント開発サーバー
bun run dev:admin      # 管理画面開発サーバー
bun run lint           # ESLint
bun run format:check   # Prettier チェック
bun run test:run       # Vitest 単体テスト
```

## テスト（TDD）

- **テストは実装の前に書く**。期待する振る舞いをテストで先に定義し、そのテストが通るように実装する。
- **Mutation スコアを品質の第一指標**とする。カバレッジ 80% 以上を目標としつつ、Mutation の閾値を優先する。
- CI では `mutation-light` / nightly 等のワークフローがある場合がある（`package.json` / `.github/workflows` を参照）。

## コードスタイル

- TypeScript strict。`any` 禁止、型を明示する。
- export する関数・型・インターフェースには TSDoc / JSDoc を付与する。
- コメントやドキュメントは、原則として日本語と英語の両方を併記する。
- `bun run lint` と `bun run format:check` が通る状態を維持する。
- 既存のディレクトリ構成・命名規則に合わせる。
- Conventional Commits 形式でコミット（`feat:`, `fix:`, `docs:` 等）。

## ブランチ・PR の命名規則

- **ブランチ**: `feature/説明`、`fix/説明`、`hotfix/説明`、`chore/説明` など（例: `feature/ai-models-ui`, `fix/search-crash`）。Issue 番号から作る場合は `feature/123`。
- **PR タイトル**: コミットメッセージに合わせる。単一トピックの PR は代表的なコミットをそのまま使う。Conventional Commits 形式（例: `feat(admin): AIモデル管理UI拡張 (#218)`）。変更内容を正しく表すタイトルにし、「Config argument parsing」のように無関係な文言にしない。
- **Cursor Cloud Agent で PR を作る場合**: 起動プロンプトに「PR タイトルは Conventional Commits で変更内容を表すこと」を含める。[Cloud Agents API](https://cursor.com/docs/background-agent/api/overview) の `target.branchName` でブランチ名を指定可能。

## マージ方法

- **main → develop** の同期 PR は必ず **Create a merge commit** でマージする（Squash だと develop → main の PR でコンフリクトが再発しやすい）。

## PR レビュー観点

- セキュリティ・パフォーマンスへの影響。
- 公開 API や型の破壊的変更。
- エラーハンドリングとログの適切さ。
- 日本語・英語のコメントがプロジェクトのトーンに合っているか。

## PR レビューコメント対応フロー

レビューコメントへの対応は [`.cursor/skills/handle-pr-review/SKILL.md`](.cursor/skills/handle-pr-review/SKILL.md) の手順に従う（Cursor / Claude Code 共通）。

**基本方針**: コメントをそのまま受け入れるのではなく、TSDoc/テスト/型定義に照らして妥当性を検証し、「修正する / 代替案で対応 / 対応不要」の 3 択で判断する。対応不要の場合は仕様根拠を添えて丁寧に説明する。

## ディレクトリ構成

```
src/              # フロントエンドアプリ
admin/            # 管理画面アプリ
server/api/       # API サーバー
server/hocuspocus/ # リアルタイムサーバー
server/mcp/       # MCP サーバー (stdio / HTTP) — Claude Code 連携
terraform/        # インフラ定義
```

## ワークスペース構成とデプロイ / Workspaces layout and deploy

- ルート `package.json` の `workspaces` は `packages/*` と `admin` のみを含む。`server/api`, `server/hocuspocus`, `server/mcp` は **意図的にルートの Bun workspace から外して**、個別の Bun プロジェクトとして管理する。  
  _Root `workspaces` covers only `packages/*` and `admin`. The three `server/*` services (`api`, `hocuspocus`, `mcp`) are intentionally kept **outside** the root Bun workspace and managed as standalone Bun projects._

### サーバ／クライアント間で共有する定数 / Sharing constants between server and client

- `packages/shared`（`@zedi/shared`）は、フロント・admin・サーバすべてで共通利用したいピュアな TypeScript 定数を集約するためのワークスペースパッケージ。React や Node 専用 API には依存させない。  
  _`packages/shared` (`@zedi/shared`) is a workspace package for pure TypeScript constants shared by client, admin, and (logically) server code. Keep it free of React or Node-only dependencies._
- フロント (`src/`) と `admin/` はワークスペース内なので `import { ... } from "@zedi/shared/..."` で直接利用できる。  
  _Workspace consumers (`src/`, `admin/`) import via `@zedi/shared/...`._
- `server/api` 等のサーバプロジェクトはワークスペース外なので `@zedi/shared` を **直接 import できない**。代わりに同じ値を当該サーバ内に二重定義し、フロント側の vitest が `fs.readFileSync` でサーバファイルを読んで両者の文字列一致を検証するドリフト検知テスト（例: `src/lib/tagCharacterClassSync.test.ts`）を置くことで CI で同期を担保する。  
  _Server projects (e.g. `server/api`) cannot import `@zedi/shared` because they are intentionally outside the workspace. Duplicate the constant inside the server source and add a client-side vitest (e.g. `src/lib/tagCharacterClassSync.test.ts`) that reads the server file via `fs.readFileSync` and asserts the two literals match. This keeps drift detectable in CI._
- 値を更新する際は **`packages/shared` とサーバ側コピーを同時に編集すること**。ドリフト検知テストが落ちたら、片方しか変更していないサインなのでもう一方も追従させる。  
  _When updating a shared value, edit `packages/shared` and the server-side copy together. If the drift test fails, the change touched only one side; sync the other._
- 理由 / Rationale:
  - Railway の Dockerfile ビルドは「各サービスの Root Directory」を build context に取る (例: `server/mcp`)。ここからルート `bun.lock` を参照するのは面倒で、context をサービス単位に閉じるほうが再現性が高い。  
    _Railway Dockerfile builds take each service's Root Directory as the build context. Scoping `bun.lock` per service keeps the build self-contained and reproducible._
  - Bun workspace が Railway 上で安定して扱えるようになった時点で再検討する（`.github/workflows/ci.yml` の `api-typecheck` / `mcp-test` ジョブにも同じメモあり）。  
    _Revisit when Bun workspaces are first-class on Railway (the same note lives in `ci.yml`)._
- 運用上の影響 / Operational impact:
  - ルートで `bun install` を実行しても `server/*` の依存は入らない。各サービスに入るには `cd server/<service> && bun install` する必要がある。  
    _Running `bun install` at the repo root does **not** install `server/*` dependencies; run `bun install` inside each service directory._
  - CI (`.github/workflows/ci.yml`) でも各サービスディレクトリで個別に `bun install` → typecheck / test を行う。  
    _CI installs and tests each service individually._
- デプロイ / Deploy:
  - `server/api`, `server/hocuspocus`, `server/mcp` は Railway の GitHub 連携で自動デプロイされる (Root Directory をサービスディレクトリに設定)。CI (`deploy-dev.yml` / `deploy-prod.yml`) はフロントエンド (Cloudflare Pages) のデプロイと DB マイグレーションを担当する。  
    _All three `server/*` services auto-deploy via Railway's GitHub integration (each Railway service is configured with the matching Root Directory). The `deploy-*.yml` workflows cover Cloudflare Pages deploys and DB migrations only._
  - `server/mcp` は `/health` を Railway のヘルスチェックに使う (`server/mcp/railway.json`)。必須環境変数: `ZEDI_API_URL` (API の内部 URL、例: `http://api.railway.internal:3000`), `BETTER_AUTH_SECRET` (API と同値)。API サービス側には `MCP_REDIRECT_URI_ALLOW` を設定する。  
    _`server/mcp` uses `/health` as its Railway healthcheck. Required env vars: `ZEDI_API_URL` (internal API URL), `BETTER_AUTH_SECRET` (must match the API service). The API service additionally requires `MCP_REDIRECT_URI_ALLOW`._
  - 関連 Issue: [#564](https://github.com/otomatty/zedi/issues/564).

### ローカル専用メモ（`docs/`・Git 追跡外）

クローン直後は `docs/` は存在しない。必要なら次で作成する（コミットされない）。

```bash
mkdir -p docs/reviews docs/spec docs/plan docs/journal
```

| パス            | 用途                                         |
| --------------- | -------------------------------------------- |
| `docs/reviews/` | 調査・セルフレビューなどの長文               |
| `docs/spec/`    | 仕様の下書き（正の仕様は常にソースとテスト） |
| `docs/plan/`    | 実装手順の下書き                             |
| `docs/journal/` | 作業ログ（例: `today.md`）                   |

**移行**: 以前ルートに `journal/` だけあった場合は、内容を `docs/journal/` へ移す。ルートの `journal/` は `.gitignore` 対象のまま残してもよいが、新規は `docs/journal/` を使う。

## その他

- 変更が大きい場合は小さな PR に分ける。
- 環境変数やシークレットはリポジトリに含めず `.env.example` で示す。
