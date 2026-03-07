# Zedi - Claude Code ガイドライン

このリポジトリでは Claude Code が PR レビューやコメント対応時に参照するルールをまとめています。

## 技術スタック

- **フロント**: React, TypeScript, Vite
- **ランタイム**: Bun
- **API**: `server/api`（Bun）
- **Lint**: ESLint, Prettier
- **テスト**: Vitest（単体）, Playwright（E2E）

## コードスタイル・レビュー観点

- TypeScript を厳格に使用する。`any` は避け、型を明示する。
- 新規コンポーネント・API にはテストを追加することを推奨する。
- `bun run lint` と `bun run format:check` が通る状態を維持する。
- 既存のディレクトリ構成・命名規則（`server/api`, `server/hocuspocus`, `admin` など）に合わせる。

## PR レビュー時のチェック

- セキュリティやパフォーマンスに影響しそうな変更がないか。
- 公開 API や型の破壊的変更がないか。
- エラーハンドリングとログが適切か。
- 日本語・英語のコメント・ドキュメントがプロジェクトのトーンに合っているか。

## その他

- 変更が大きい場合は小さな PR に分けることを推奨する。
- 環境変数やシークレットはリポジトリに含めず、`.env.example` で必要なキー名だけ示す。
