# Zedi - AI Agent Guidelines

プロジェクト全体の AI エージェント向け共通ガイドライン。
Cursor, Claude Code, GitHub Copilot, Codex 等すべてのエージェントが参照する。

## 技術スタック

- **フロント**: React, TypeScript, Vite
- **ランタイム**: Bun
- **API**: `server/api`（Hono on Bun）
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

- **テストは実装の前に書く**（テスト駆動開発・TDD を徹底する）。新規機能・修正では、期待する振る舞いをテストで先に定義し、そのテストが通るように実装する。
- **テスト品質の指標は Mutation スコアを優先する**。カバレッジ 80% 以上は目標とするが、Mutation スコアの閾値を満たすことを優先する。
- 詳細は [docs/guides/testing-guidelines.md](docs/guides/testing-guidelines.md) を参照。

## コードスタイル

- TypeScript strict。`any` 禁止、型を明示する。
- export する関数・型・インターフェースには TSDoc / JSDoc を付与する。
- コメントやドキュメントは、原則として日本語と英語の両方を併記する。
- `bun run lint` と `bun run format:check` が通る状態を維持する。
- 既存のディレクトリ構成・命名規則に合わせる。
- Conventional Commits 形式でコミット（`feat:`, `fix:`, `docs:` 等）。

## ブランチ・PR の命名規則

- **ブランチ**: `feature/説明`、`fix/説明`、`hotfix/説明`、`chore/説明` など（例: `feature/ai-models-ui`, `fix/search-crash`, `hotfix/security-patch`）。Issue 番号から作る場合は `feature/123` のようにする。詳細は [branch-strategy.md](docs/guides/branch-strategy.md) を参照。
- **PR タイトル**: コミットメッセージに合わせる。単一トピックの PR は代表的なコミットをそのまま使う。Conventional Commits 形式（例: `feat(admin): AIモデル管理UI拡張 (#218)`）。変更内容を正しく表すタイトルにし、「Config argument parsing」のように無関係な文言にしない。
- **Cursor Cloud Agent で PR を作る場合**: リポジトリのルール（本ファイルや `.cursor/rules/`）はエージェントが参照する場合があるが、Cloud Agent 起動時に「PR を作成するときはタイトルを Conventional Commits 形式にし、変更内容を表す文言にすること」とプロンプトに含めると確実。API で起動する場合は `target.branchName` でブランチ名を指定できる（[Cloud Agents API](https://cursor.com/docs/background-agent/api/overview)）。PR タイトルを直接指定する API パラメータは 2026 年現在ないため、プロンプトで指示するか、作成後に手動で修正する。

## PR レビュー観点

- セキュリティ・パフォーマンスへの影響。
- 公開 API や型の破壊的変更。
- エラーハンドリングとログの適切さ。
- 日本語・英語のコメントがプロジェクトのトーンに合っているか。

## PR レビューコメント対応フロー

レビューコメントへの対応は以下の手順で行う。

### 1. 未対応コメントの取得

**注意**: 以下は「未返信」のトップレベルコメントを取得する方式。GitHub の `Require conversation resolution before merging` は「未解決のスレッド」をブロックするため、返信済みだが未解決のスレッドはこの方式では検出されない。マージ可否の完全な判定には、PR の `mergeable` 状態や `reviewDecision` の確認を併用すること。

返信済みコメントを除外し、未返信のトップレベルコメントを取得する（新規セッションでも動作する）:

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '
    [.[] | select(.in_reply_to_id != null) | .in_reply_to_id] as $replied |
    [.[] | select(.in_reply_to_id == null and (.id | IN($replied[]) | not))]
    | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login}'
```

コメントが 30 件を超える場合は `?per_page=100` や `--paginate` でページネーションを指定すること。

### 2. PR の自動検出

ブランチ名から PR を特定する:

```bash
gh pr list --head "$(git branch --show-current)" --json number,url --jq '.[0]'
```

### 3. 再レビュー依頼

```bash
gh pr comment {number} --body "レビューコメントへの対応をコミットしました。最新の変更に対する再レビューをお願いします。

@coderabbitai review"
```

## ディレクトリ構成

```
src/              # フロントエンドアプリ
admin/            # 管理画面アプリ
server/api/       # API サーバー
server/hocuspocus/ # リアルタイムサーバー
terraform/        # インフラ定義
docs/             # ドキュメント
```

## マージ方法

- **main → develop** の同期 PR は必ず **Create a merge commit** でマージする（Squash だと develop → main の PR でコンフリクトが再発する）。詳細は [docs/guides/branch-strategy.md](docs/guides/branch-strategy.md#マージ方法のルール) を参照。

## その他

- 変更が大きい場合は小さな PR に分ける。
- 環境変数やシークレットはリポジトリに含めず `.env.example` で示す。
