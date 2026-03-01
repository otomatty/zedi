# デプロイ・モデル同期 確認結果（MCP による確認）

## 確認日時

2026-03-01 頃（デプロイ成功想定のタイミング）

## 1. API 稼働確認

| エンドポイント     | 結果       | 内容                                                     |
| ------------------ | ---------- | -------------------------------------------------------- |
| GET /api/health    | **200 OK** | `{"status":"ok","timestamp":"..."}` — API は稼働中       |
| GET /api/ai/models | **200 OK** | `{"models":[],"tier":"free"}` — モデル一覧は空（同期前） |

→ **デプロイは成功しており、API は正常に応答しています。**

## 2. 管理エンドポイント（同期用）

| エンドポイント                                      | 結果              | 内容               |
| --------------------------------------------------- | ----------------- | ------------------ |
| GET /api/ai/admin/sync-models                       | **404 Not Found** | ルートが存在しない |
| POST /api/ai/admin/sync-models (X-Sync-Secret 付き) | **404 Not found** | 同上               |

→ **現在デプロイされているビルドには、管理用ルート（`/api/ai/admin/*`）が含まれていません。**

考えられる原因:

- デプロイ時に、`server/api/src/routes/ai/admin.ts` および `app.ts` での `aiAdminRoutes` のマウントが含まれていない
- 別のコミット／ブランチの内容でビルドされている

## 3. モデル一覧の自動同期について

- 上記のとおり **POST /api/ai/admin/sync-models が 404 のため、現時点では同期を実行できません。**
- 管理エンドポイントを含むコードで **再デプロイ** したうえで、同じ POST を再度実行してください。

## 4. 推奨アクション

1. **最新コードで再デプロイ**
   - リポジトリルートで `railway up`（パスなし）を実行するか、develop ブランチへ push して CI でデプロイする。
2. **再デプロイ後、同期を実行**
   ```bash
   curl -X POST "https://api-development-b126.up.railway.app/api/ai/admin/sync-models" \
     -H "X-Sync-Secret: あなたのSYNC_AI_MODELS_SECRET"
   ```
3. **成功時**  
   `{"ok":true,"results":[...]}` が返り、`/api/ai/models` でモデル一覧が取得できるようになります。
