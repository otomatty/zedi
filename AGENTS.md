# Zedi - AI Agent Guidelines

プロジェクト全体の AI エージェント向け共通ガイドライン。
Cursor, Claude Code, GitHub Copilot, Codex 等すべてのエージェントが参照する。

## 仕様・ドキュメント（最重要）

- **仕様の正（source of truth）はコードの TSDoc / JSDoc とテスト**。詳細は [`SPECIFICATION_POLICY.md`](SPECIFICATION_POLICY.md)。
- **Git に追跡させない** — `.gitignore` で `docs/` およびルートの `journal/` を除外する。長文の仕様・メモをリモートに載せない。
- **ローカル専用の `docs/`** — 調査・下書き・作業ログ用に、追跡されない `docs/` 以下へファイルを置いてよい（構成は下記「ローカル専用メモ」）。これらは契約や CI の根拠にはしない。
- **不要になった説明は削除する**（ローカルファイル含む）。エージェントに古い文面を渡さず、コンテキストを浪費しない。
- **`docs/` を勝手に読まない**。ユーザーが `@ファイル` で添付したファイルは読む（`.cursor/rules/specification-and-docs.mdc`）。

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
```

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
