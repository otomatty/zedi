# 開発者データ同期スクリプト

本番と開発の DB 間で、**特定ユーザーのデータだけ**を同期するためのスクリプト群です。

## Aurora 用

- **スクリプト:** `sync-aurora-dev-data.ts`
- **仕様:** [docs/plans/aurora-sync-script-spec.md](../../docs/plans/aurora-sync-script-spec.md)
- **設定:** `dev-user-mapping-aurora.json`（`dev-user-mapping-aurora.example.json` をコピーして作成。`.gitignore` 済み）
- **環境変数:** `PROD_AURORA_CLUSTER_ARN`, `PROD_AURORA_SECRET_ARN`, `DEV_AURORA_CLUSTER_ARN`, `DEV_AURORA_SECRET_ARN`（任意: `PROD_AURORA_DATABASE`, `DEV_AURORA_DATABASE`, `AWS_REGION`）
- **ユーザー特定:** 設定で `email` のみ、または `productionCognitoSub` / `developmentCognitoSub` を指定

### コマンド

```bash
# 設定の email から本番・開発の cognito_sub を取得（config にコピー用）
bun run sync:aurora:resolve-cognito

bun run sync:aurora:dev              # 設定の direction で同期（既定: dev-to-prod）
bun run sync:aurora:dry             # ドライラン
bun run sync:aurora:verbose         # 詳細ログ
bun run sync:aurora:prod-to-dev     # 本番 → 開発 のみ
bun run sync:aurora:dev-to-prod     # 開発 → 本番 のみ
```

**cognito_sub の取得:** 上記と同じ環境変数で `bun run sync:aurora:resolve-cognito` を実行すると、各 email の本番・開発の `cognito_sub` が表示されます。表示を `dev-user-mapping-aurora.json` に書き写してください。

**本番にユーザーが存在しない場合:** 本番 Aurora の `users` が空（ログインしても upsert が動いていない等）のときは、Cognito で sub を確認し `bun run sync:aurora:insert-user -- --email "..." --cognito-sub "..." --target prod` で手動投入できます（要 `PROD_AURORA_*`）。

**実行の流れ（例）:** 環境変数設定 → `sync:aurora:resolve-cognito` で cognito_sub 確認・設定更新 → `sync:aurora:dry` でドライラン → `sync:aurora:dev` で同期（設定の direction に従う。既定は **dev-to-prod**）。本番→開発にしたい場合は `sync:aurora:prod-to-dev` を実行するか、設定の `direction` を `prod-to-dev` に変更。
