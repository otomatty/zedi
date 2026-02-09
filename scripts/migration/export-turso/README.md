# Turso エクスポート（C2-1）

Phase C2 データ移行のため、Turso の全テーブルを 1 つの JSON にエクスポートするスクリプトです。

## 前提

- Node 18+
- プロジェクトルートで `npm install` 済み（`@libsql/client` を使用）
- Turso の **DATABASE URL** と **AUTH TOKEN** を取得済み（本番エクスポート時は読み取り専用推奨）

## 実行方法

```bash
# プロジェクトルートから
export TURSO_DATABASE_URL="libsql://your-db.turso.io"
export TURSO_AUTH_TOKEN="your-token"
node scripts/migration/export-turso/export-turso.mjs
```

出力は `scripts/migration/export-turso/output/turso-export-YYYY-MM-DDTHH-mm-ss.json` に作成されます。

別ディレクトリに出力する場合:

```bash
node scripts/migration/export-turso/export-turso.mjs --out-dir=./my-export
```

## 出力形式

[EXPORT_FORMAT.md](./EXPORT_FORMAT.md) を参照してください。

## 次ステップ（C2-2）

エクスポート JSON を入力に、nanoid → UUID のマッピング・users 生成・Aurora 用変換を行うスクリプトを実装します。
