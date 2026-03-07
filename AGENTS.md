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

## コードスタイル

- TypeScript strict。`any` 禁止、型を明示する。
- `bun run lint` と `bun run format:check` が通る状態を維持する。
- 既存のディレクトリ構成・命名規則に合わせる。
- Conventional Commits 形式でコミット（`feat:`, `fix:`, `docs:` 等）。

## PR レビュー観点

- セキュリティ・パフォーマンスへの影響。
- 公開 API や型の破壊的変更。
- エラーハンドリングとログの適切さ。
- 日本語・英語のコメントがプロジェクトのトーンに合っているか。

## PR レビューコメント対応フロー

レビューコメントへの対応は以下の手順で行う。

### 1. 未対応コメントの取得

返信済みコメントを除外し、未対応のものだけ取得する（新規セッションでも動作する）:

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '
    [.[] | select(.in_reply_to_id != null) | .in_reply_to_id] as $replied |
    [.[] | select(.in_reply_to_id == null and (.id | IN($replied[]) | not))]
    | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login}'
```

### 2. PR の自動検出

ブランチ名から PR を特定する:

```bash
gh pr list --head "$(git branch --show-current)" --json number,url --jq '.[0]'
```

### 3. 再レビュー依頼

```bash
gh pr comment {number} --body "@claude /review
@coderabbitai review
@copilot 再レビューをお願いします。"
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

## その他

- 変更が大きい場合は小さな PR に分ける。
- 環境変数やシークレットはリポジトリに含めず `.env.example` で示す。
