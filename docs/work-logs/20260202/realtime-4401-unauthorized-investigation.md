# 調査: リアルタイム接続 4401 Unauthorized

**日付:** 2026-02-02  
**対象:** AWS Hocuspocus 接続で code 4401 / reason "Unauthorized" により即切断される事象

---

## 1. 結論

**原因:** クライアントに **y-websocket (WebsocketProvider)** を使用しているが、Hocuspocus サーバーは **Hocuspocus プロトコル**（接続直後に Auth メッセージ送信）を要求している。y-websocket は Y.js の汎用プロトコルのみ送るため、サーバーが「認証メッセージ未受信」とみなし、idle timeout またはメッセージ解析失敗で **4401 Unauthorized** を返して切断している。

**対応:** クライアントを **@hocuspocus/provider (HocuspocusProvider)** に差し替える。

---

## 2. サーバー側の挙動（@hocuspocus/server）

- `ClientConnection` は新規 WebSocket 接続ごとに **idle timeout** を設定（デフォルト 30 秒）。
- **認証が必要**（`onAuthenticate` が定義されている）な場合、サーバーは **最初のメッセージが MessageType.Auth** であることを期待する。
- 最初のメッセージが Auth でない場合、そのメッセージはキューに積まれ、Auth が届くまで待つ。この間 `setUpNewConnection` は呼ばれず **idle timeout は解除されない**。
- idle timeout 発火、またはメッセージのデコード失敗時に `websocket.close(Unauthorized.code, Unauthorized.reason)` が呼ばれる（4401 / "Unauthorized"）。
- y-websocket は Hocuspocus の Auth メッセージを送らないため、サーバーは Auth を待ち続け、timeout または解析エラーで 4401 を返す。

参照: `server/hocuspocus/node_modules/@hocuspocus/server/src/ClientConnection.ts`  
（idle timeout 86–88 行、Auth 待ち 223–225 行、デコード失敗時 281–283 行、Unauthorized は `@hocuspocus/common` で code 4401）

---

## 3. クライアント側（現状）

- `CollaborationManager` で **y-websocket** の `WebsocketProvider` を使用。
- 接続 URL に `?token=...` を付与しているが、Hocuspocus は **バイナリの Auth メッセージ**（documentName + MessageType.Auth + token）を期待しており、クエリの token だけでは認証フローを完了しない。

---

## 4. 実施した対応

1. **CollaborationManager を HocuspocusProvider に差し替え**  
   - パッケージ: `@hocuspocus/provider` を追加し、`WebsocketProvider` の代わりに `HocuspocusProvider` を使用。  
   - Hocuspocus が期待する認証フロー（Auth メッセージ送信）に準拠する。

2. **Cognito 統一時の方針（調査メモ）**  
   - クライアント: `getAuthToken()` を Cognito の ID token / Access token 取得に変更。  
   - サーバー: `onAuthenticate` 内で Cognito JWT を検証（`aws-jwt-verify` 等）。  
   - Terraform: ECS タスクには既に `COGNITO_USER_POOL_ID` / `COGNITO_REGION` が渡されている。

---

## 5. Cognito 統一時の調査メモ（将来対応）

- **クライアント**
  - `useCollaboration` / `CollaborationManager` の `getAuthToken` を、Clerk の `getToken()` ではなく **Cognito の ID Token 取得** に差し替える。
  - 例: `@aws-amplify/auth` または `amazon-cognito-identity-js` で `getIdToken()` を返す関数を渡す。
- **サーバー (Hocuspocus)**
  - `onAuthenticate` 内で **Cognito JWT を検証** する（例: `aws-jwt-verify` の `CognitoJwtVerifier`）。
  - 検証内容: issuer (`https://cognito-idp.{region}.amazonaws.com/{userPoolId}`)、token_use: `id` または `access`、有効期限。
  - ECS タスクには既に `COGNITO_USER_POOL_ID` / `COGNITO_REGION` が Terraform で渡されている（`terraform/modules/realtime/main.tf` の container_definitions）。
- **参考**
  - [Verifying a JWT – Amazon Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
  - [aws-jwt-verify](https://github.com/awslabs/aws-jwt-verify)

---

## 6. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| 実装計画・現状 | docs/plans/20260123/implementation-status-and-roadmap.md |
| Hocuspocus デプロイ | docs/work-logs/20260201/hocuspocus-server-deployment.md |
| Tiptap コラボセットアップ | docs/work-logs/20260201/tiptap-collaboration-setup.md |
| Tiptap Hocuspocus Provider | https://tiptap.dev/docs/hocuspocus/provider/configuration |
