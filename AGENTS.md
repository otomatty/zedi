# Zedi - AI Agent Guidelines

## AI-DLC (aidlc-workflows v2)

[AI-DLC](https://github.com/awslabs/aidlc-workflows/tree/v2) Codex harness（`aidlc 2.4.1`）導入済み。**本ファイルの Zedi 方針が常に優先**。ライフサイクル実行時のみ AI-DLC を使う。

エンジンは **1 系統（Codex dist → `.codex/`）**。Cursor / Claude Code はスキルミラー経由で同じオーケストレータを呼ぶ（公式の Claude フル `.claude/` エンジンは入れない — Zedi の `.agents/` 正本と衝突するため）。

| 項目            | パス / コマンド                                                    |
| --------------- | ------------------------------------------------------------------ |
| Orchestrator    | `.agents/skills/aidlc/`                                            |
| Engine          | `.codex/`                                                          |
| Workspace shell | `aidlc/spaces/default/memory/`                                     |
| Doctor          | `bun .codex/tools/aidlc-utility.ts doctor`                         |
| スキルミラー    | `bun run setup:agent-mirrors`（`.agents` → `.cursor` / `.claude`） |

### ハーネス別の起動

| ハーネス        | 起動                                 | 前提                                                              |
| --------------- | ------------------------------------ | ----------------------------------------------------------------- |
| **Cursor**      | `/aidlc` またはスキル `aidlc`        | `.cursor/skills` ミラー（`bun run init` / `setup:agent-mirrors`） |
| **Claude Code** | `/aidlc`                             | `.claude/skills` ミラー + `bun` が非対話シェルの PATH にあること  |
| **Codex CLI**   | `$aidlc`（または `/skills` → aidlc） | Codex ≥ 0.139.0、プロジェクト trust、`$CODEX_HOME` の hook trust  |

```bash
bun .codex/tools/aidlc-utility.ts doctor   # 健全性
/aidlc --doctor                            # セッション内（Cursor / Claude）
$aidlc --doctor                            # Codex
/aidlc Build a …                           # ワークフロー開始（スコープ自動判定）
```

- メソッドルールの編集は `aidlc/spaces/<space>/memory/`（`.codex/` は触らない）。
- **モデル課金**: Claude Code → Claude.ai サブスク、Codex → ChatGPT / Codex サブスク。プロジェクトの `.codex/config.toml` は Bedrock を無効化済み（`model_provider` コメントアウト）。Bedrock に戻すときは同ファイルのコメントを復元。
- Codex hooks: 初回は TUI で Trust、または `.codex/trust-seed.toml` を `$CODEX_HOME/config.toml` に反映（マシンローカル）。

## テスト駆動開発（必守） / TDD (mandatory)

Zedi は **TDD を徹底**する。実装を先に書いてテストを後付けしない。

### サイクル / Cycle

1. **Red** — 期待する振る舞いを表すテストを書き、失敗することを確認する。
2. **Green** — そのテストを通す最小実装だけを書く。
3. **Refactor** — テストを緑のまま整理する。振る舞い変更はテストを先に直す。

### 禁止事項 / Do not

- 実装を読んで期待値を合わせる「写し絵テスト」（バグを仕様として固定化する）。
- テスト失敗時に、根拠なく期待値だけを実装に合わせて書き換えること。
- `server/api` / `server/mcp` への colocated テスト新規追加（配置規則を守る）。

### 品質指標 / Quality metrics

| 指標                           | 方針                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Mutation score（第一指標）** | Stryker。PR の `mutation-light` は `stryker.config.mjs` の `thresholds.break: 70`。目標は golden list で 85%+。     |
| **行カバレッジ**               | 80% 以上を目標。Mutation が取れないスコープ（例: `server/api`）では coverage + 強いアサーションで担保。             |
| **CI**                         | `mutation-light`（限定 mutate）/ nightly（観測、`break: null`）。コマンドは `package.json` と `.github/workflows`。 |

### コマンド / Commands

```bash
bun run test:run                 # ワークスペース横断の Vitest
bun run test:coverage            # カバレッジ
bun run test:e2e                 # Playwright
bun run test:mutation:dry        # Stryker dry-run
bun run test:mutation            # Stryker（フロント中心）
bun run test:mutation:changed    # 変更ファイルのみ Mutation
bun run test:mutation:changed:list
```

- フロント変更の Mutation: `.agents/skills/stryker-mutation-diff/SKILL.md` または `scripts/stryker-mutate-changed.mjs`。
- `server/api` は Stryker 対象外 → coverage とアサーション強度で検証。

### エージェント用パイプライン / Agent test pipeline

新規・既存モジュールのテスト強化は次を使う（詳細は `.agents/skills/README-test-pipeline.md`）:

| スキル           | 用途                                                                          |
| ---------------- | ----------------------------------------------------------------------------- |
| `test-inventory` | ギャップ分析・優先順位（テストは書かない）                                    |
| `spec-test`      | 仕様抽出 → **実装を読まない**テスト設計 → Mutation / アサーション検証         |
| サブエージェント | `spec-extractor` / `test-designer` / `mutation-verifier`（`.agents/agents/`） |

`spec-test` の Zedi overlay（`overlay: zedi`）がテスト配置・コマンド・Mutation 範囲の正。  
_Overlay: `.agents/skills/spec-test/references/overlays/zedi.md`._

### テスト配置 / Test placement

| スコープ                                            | 配置                                              |
| --------------------------------------------------- | ------------------------------------------------- |
| `src/`, `admin/`, `packages/*`, `server/hocuspocus` | 実装と同階層（`foo.ts` → `foo.test.ts`）          |
| `server/api`, `server/mcp`                          | `src/__tests__/` にソースツリーをミラー。同居禁止 |
| E2E                                                 | `e2e/*.spec.ts`（Playwright）                     |

---

## 技術スタック / Stack

- **フロント**: React, TypeScript, Vite（`src/`）
- **ランタイム**: Bun（Node ≥ 24 / Bun ≥ 1）
- **API**: `server/api`（Hono on Bun）
- **リアルタイム**: `server/hocuspocus`（Y.js）
- **MCP**: `server/mcp`（stdio / HTTP。詳細: [`server/mcp/README.md`](server/mcp/README.md)）
- **管理画面**: `admin/`
- **共有パッケージ**: `packages/ui`（`@zedi/ui`）、`packages/shared`（`@zedi/shared`）、`packages/claude-sidecar`
- **デスクトップ**: Tauri（`src-tauri/`）
- **ブラウザ拡張**: `extension/`
- **Lint / Format**: ESLint, Prettier
- **テスト**: Vitest, Playwright, Stryker
- **インフラ（方針）**: **Cloudflare へ完全移行予定**（Workers / Static Assets / R2 / D1・KV 等。Issue [#1088](https://github.com/otomatty/zedi/issues/1088)）。構成の正本は `wrangler.jsonc`。**Terraform と Railway は廃止予定**（移行完了まで暫定稼働あり）。品質ゲートは GitHub Actions、デプロイは `wrangler deploy` へ寄せる。詳細は [`.agents/skills/cloudflare-zedi/SKILL.md`](.agents/skills/cloudflare-zedi/SKILL.md)。

---

## ディレクトリ構成 / Layout

```
src/                 # フロントエンド
admin/               # 管理画面
packages/
  ui/                # @zedi/ui
  shared/            # @zedi/shared（ピュア TS 定数）
  claude-sidecar/
server/
  api/               # Hono API（ルート workspace 外）
  hocuspocus/        # リアルタイム（ルート workspace 外）
  mcp/               # MCP（ルート workspace 外）
e2e/                 # Playwright
extension/           # ブラウザ拡張
src-tauri/           # Tauri
terraform/           # Cloudflare 旧 IaC（廃止予定。正本は各サービスの wrangler.jsonc）
.agents/             # Agent Skills / サブエージェント正本（`bun run init` でミラー）
.codex/              # AI-DLC エンジン（Codex harness）
aidlc/               # AI-DLC workspace shell
```

### 命名規則 / Naming

- **機能・ドメインディレクトリ**: camelCase（例: `src/lib/aiChat/`）。kebab-case 禁止。
- **単一コンポーネント束**: PascalCase（例: `src/components/editor/PageEditor/`）。
- **`src/pages/` 直下**: PascalCase（例: `NoteSettings/`）。
- **例外**: `packages/ui/src/components/` は shadcn の kebab-case を維持。
- ファイル: コンポーネント `PascalCase.tsx`、フック `use*.ts(x)`、それ以外 `camelCase.ts`。

### 配置規則 / Placement

- `src/hooks/` は **`use*` のみ**。非フックは `src/lib/`。
- `src/pages/` にフックを置かない。ページ専用フックも `src/hooks/`。
- 同一ドメインのフックが **2 つ以上** → `src/hooks/<domain>/`。汎用フックは `src/hooks/` 直下。テストは同居。
- フック関連の import は相対パスではなく `@/`。
- `src/lib/` も同一ドメインが 2 つ以上ならサブディレクトリ化。
- `server/api`: ドメインロジック → `src/services/`、汎用ヘルパー → `src/lib/`。`*Service.ts` は `services/`。

---

## ワークスペースとデプロイ / Workspaces & deploy

### 移行方針 / Migration target（Cloudflare）

- **目標**: API / MCP / リアルタイム / フロント / admin / オブジェクトストレージを **Cloudflare に集約**。Pages・Terraform・Railway は段階的に廃止。
- **構成の正本**: 各サービスの `wrangler.jsonc`（Terraform ステートは使わない）。
- **フロント / admin**: Pages → **Workers Static Assets**。
- **CI/CD**: lint / test / typecheck / drizzle-check は GitHub Actions。デプロイ・プレビューは `wrangler deploy` / `wrangler versions upload`。
- **データ切替**: ビッグバン・カットオーバー（デュアルライトしない）。フェーズ・検証は `cloudflare-zedi` スキルと [#1088](https://github.com/otomatty/zedi/issues/1088) を正とする。
- Cloudflare 作業時は汎用 Cloudflare 知識より **[`.agents/skills/cloudflare-zedi/SKILL.md`](.agents/skills/cloudflare-zedi/SKILL.md)** を先に読む。

### 現状（移行中） / Current (transitional)

- ルート `workspaces` は **`packages/*` と `admin` のみ**。`server/api`・`hocuspocus`・`mcp` は **workspace 外**（サービス単位の `bun.lock`。旧 Railway build context 由来。Workers 化後もサービス単位のまま扱う想定）。
- ルート `bun install` では `server/*` の依存は入らない → 各サービスで `cd server/<service> && bun install`。
- CI もサービスごとに install → typecheck / test（`api-typecheck`, `api-test`, `mcp-test`, `hocuspocus-test`）。
- **暫定デプロイ**: `server/*` の一部はまだ Railway。フロントは Cloudflare Pages。DB migrate は `deploy-dev.yml` / `deploy-prod.yml`（`develop` → dev DB、`main` → prod DB）。API Worker 骨格は `server/api/wrangler.jsonc` と `deploy-api-worker-dev.yml` が先行。
- `server/mcp`: ヘルス `/health`。必須 env: `ZEDI_API_URL`, `BETTER_AUTH_SECRET`（API と同値）。API 側に `MCP_REDIRECT_URI_ALLOW`。関連: [#564](https://github.com/otomatty/zedi/issues/564)。

### `@zedi/shared` とサーバ二重定義 / Shared constants drift

- `packages/shared` は React / Node 専用 API に依存しないピュア TS。
- フロント・admin は `import { … } from "@zedi/shared/…"`。
- `server/*` は workspace 外のため **直接 import 不可** → サーバ内に同値を二重定義し、フロントの vitest が `fs.readFileSync` で文字列一致を検証（例: `src/lib/tagCharacterClassSync.test.ts`）。
- 値の更新は **shared とサーバ側を同時に**。ドリフトテストが落ちたら片方未更新。

---

## DB スキーマ変更（必読） / Database schema changes

- **TS スキーマと SQL マイグレーションは常に対**。`server/api/src/schema/**/*.ts` を編集したら `server/api/drizzle/NNNN_*.sql` を追加し、`server/api/drizzle/meta/_journal.json` に追記。  
  _Skipping this caused production 500s in PR #728._
- **正本は `server/api/drizzle/` のみ**。CI は `bunx drizzle-kit migrate` のみ。他場所の SQL は本番に効かない。
- 書き方: `--> statement-breakpoint`、原則 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`、必要なら同一ファイルでバックフィル。`drizzle-kit generate` の巨大 diff は手で削減（snapshot は当面コミットしない）。
- CI: `drizzle-migration-check`。SQL 不要な変更のみ `[skip drizzle-check]`。
- 自動適用: `develop` → `deploy-dev.yml`、`main` → `deploy-prod.yml` のみ。

---

## ブランチ・PR・マージ / Branch, PR, merge

- **ブランチ**: `feature/…`, `fix/…`, `hotfix/…`, `chore/…`（Issue なら `feature/123` 等）。
- **PR タイトル**: Conventional Commits で変更内容を表す（無関係な定型文禁止）。Cloud Agent 起動時も同様に指示。
- **main → develop** の同期は必ず **Create a merge commit**（Squash 禁止）。
