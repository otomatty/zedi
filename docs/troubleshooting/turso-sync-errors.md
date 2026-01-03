# Turso同期エラーのトラブルシューティング

## 問題の概要

本番環境でクラウド同期が失敗する場合、以下の2つのエラーが発生する可能性があります：

1. **CORSエラー**: `Access to fetch at 'https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline' from origin 'https://zedi-note.app' has been blocked by CORS policy`
2. **認証エラー**: `POST https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline net::ERR_FAILED 401 (Unauthorized)`

## 解決方法

### 1. CORS設定について

**重要**: TursoダッシュボードにはCORS設定のUIが**存在しません**。TursoはJWT認証を使用してアクセス制御を行い、CORSは自動的に処理される設計になっています。

#### CORSエラーが発生する場合の対処法

CORSエラーが発生する場合、以下の可能性があります：

1. **JWT認証が正しく設定されていない**
   - JWT認証が正しく設定されていない場合、TursoがCORSヘッダーを返さない可能性があります
   - 次のセクション「JWT認証設定の確認」を参照してください

2. **TursoのHTTP APIの制限**
   - TursoのHTTP APIは、認証されたリクエストに対してのみCORSヘッダーを返す可能性があります
   - 401エラーが発生している場合、CORSエラーも同時に発生することがあります

3. **代替案: プロキシサーバーの使用**
   - ブラウザから直接Tursoに接続する代わりに、バックエンドAPIサーバーを経由する方法があります
   - この場合、CORSはバックエンドサーバーで制御できます

#### 確認方法

ブラウザの開発者ツールで以下を確認してください：

1. **Network**タブでリクエストを確認
2. リクエストヘッダーに `Authorization: Bearer <token>` が含まれているか確認
3. レスポンスヘッダーに `Access-Control-Allow-Origin` が含まれているか確認
4. 401エラーが先に発生している場合、CORSエラーは二次的な問題の可能性があります

### 2. JWT認証設定の確認

ClerkのJWTトークンがTursoで正しく認証されるように設定されているか確認します。

#### 必要な設定

1. **Clerk側の設定**
   - JWTテンプレート `turso` が作成されているか確認
   - テンプレートに必要なクレームが含まれているか確認

2. **Turso側の設定**
   - ClerkのJWKSエンドポイントがTursoに登録されているか確認
   - データベースの認証設定でJWT認証が有効になっているか確認

#### 確認手順

##### Clerk JWTテンプレートの確認

1. [Clerkダッシュボード](https://dashboard.clerk.com/)にログイン
2. **JWT Templates** に移動
3. `turso` という名前のテンプレートが存在するか確認
4. 存在しない場合は作成：
   ```json
   {
     "aud": "turso",
     "iss": "https://your-clerk-domain.clerk.accounts.dev"
   }
   ```

##### Turso JWKS設定の確認

1. **JWKSエンドポイントの確認**:
   ```bash
   turso org jwks list
   ```
   - 現在登録されているJWKSエンドポイントが表示されます
   - 例: `Zedi Clerk` → `https://clerk.zedi-note.app/.well-known/jwks.json`

2. **JWTテンプレートの生成**:
   ```bash
   turso org jwks template --database zedi --scope full-access
   ```
   - このコマンドで生成されたJSONをClerkのJWTテンプレートに使用します
   - 出力例: `{"a":"rw","id":"33057661-834e-4891-9b48-802d425d02b9","perm":[],"rid":"..."}`

3. **ClerkのJWTテンプレート設定**:
   - Clerkダッシュボード > **JWT Templates** > `turso` テンプレート
   - 上記で生成されたJSONをクレームとして設定
   - JWKS URL: `https://clerk.zedi-note.app/.well-known/jwks.json`

**注意**: Turso CLI v1.0.15では、データベースにJWKSを直接関連付けるコマンド（`turso db auth jwks attach`）が見つかりませんでした。組織レベルでJWKSが登録されていれば、その組織内のすべてのデータベースで使用できる可能性があります。詳細は[確認レポート](./turso-jwks-check.md)を参照してください。

#### 確認方法

ブラウザの開発者ツールで：
1. **Network**タブを開く
2. 同期リクエスト（`/v2/pipeline`）を確認
3. **Request Headers**に `Authorization: Bearer <token>` が含まれているか確認
4. トークンが正しく送信されているのに401エラーが出る場合は、Turso側のJWKS設定を確認

### 3. 環境変数の確認

本番環境で以下の環境変数が正しく設定されているか確認：

```env
VITE_TURSO_DATABASE_URL=libsql://zedi-otomatty.aws-ap-northeast-1.turso.io
```

**注意**: `VITE_TURSO_AUTH_TOKEN` は使用しません。認証はClerkのJWTトークンを使用します。

### 4. デバッグ情報の確認

アプリケーションのコンソールに以下のログが出力されます：

```
[Turso] Creating authenticated client { url, hasToken, tokenLength, origin }
[Turso] Connection test successful
[Sync] Starting sync for user: <userId>
```

エラーが発生する場合、詳細なエラーメッセージが表示されます。

## よくある問題と解決策

### 問題1: CORSエラーが続く

**原因**: JWT認証が正しく設定されていない、または401エラーが先に発生している

**解決策**:
1. **JWT認証設定を確認**（最も重要）
   - ClerkのJWTテンプレートが正しく設定されているか確認
   - Turso側のJWKS設定が正しく登録されているか確認
   - JWTトークンが正しく送信されているか確認（ブラウザの開発者ツールで確認）

2. **401エラーを先に解決**
   - CORSエラーは401エラーの結果として発生することが多い
   - 認証が正しく機能すれば、CORSエラーも解消される可能性が高い

3. **Tursoサポートに問い合わせ**
   - 上記を試しても解決しない場合、TursoのサポートまたはDiscordコミュニティに問い合わせ
   - データベース名、エラーメッセージ、リクエストヘッダーを含めて報告

### 問題2: 401 Unauthorizedエラーが続く

**原因**: JWTトークンは正しく生成されているが、Turso側でJWKSエンドポイントがデータベースに関連付けられていない

**確認済み**:
- ✅ JWTトークンは正しく生成されている（必要なクレームがすべて含まれている）
- ✅ JWKSエンドポイントはアクセス可能
- ✅ 組織レベルでJWKSが登録されている

**解決策**:
1. **Tursoサポートに問い合わせ**（最優先）
   - データベース `zedi` にJWKSエンドポイント `Zedi Clerk` を関連付ける方法を確認
   - [Turso Discord](https://discord.gg/turso) または [Turso Support](https://turso.tech/support)
   - エラーメッセージ、データベース名、JWKSエンドポイントを含めて報告

2. **Tursoダッシュボードで確認**
   - データベース `zedi` の設定ページでJWKS関連の設定があるか確認
   - データベースレベルでJWKSを有効化するオプションがあるか確認

3. **Turso CLIの最新バージョンを確認**
   - 現在のバージョン: v1.0.15
   - 最新バージョンにアップデートして、新しいコマンドが追加されていないか確認

### 問題3: 開発環境では動作するが本番環境で失敗する

**原因**: 環境変数やCORS設定が本番環境で正しく設定されていない

**解決策**:
1. 本番環境の環境変数を確認
2. 本番環境のオリジンがTursoのCORS設定に含まれているか確認
3. 本番環境のビルドで環境変数が正しく注入されているか確認

## 確認レポート

実際の設定確認結果は以下のドキュメントを参照してください：

- [turso-jwks-check.md](./turso-jwks-check.md) - Turso CLIでの設定確認結果
- [jwt-token-analysis.md](./jwt-token-analysis.md) - JWTトークンの詳細分析

### 重要な発見

実際のリクエストを分析した結果：

✅ **JWTトークンは正しく生成されている**
- 必要なクレーム（`a`, `id`, `perm`, `rid`）がすべて含まれている
- 有効期限もまだ有効
- 発行者（`iss`）も正しい: `https://clerk.zedi-note.app`

✅ **JWKSエンドポイントもアクセス可能**
- `https://clerk.zedi-note.app/.well-known/jwks.json` は正しく応答している

❌ **しかし401エラーが発生している**

これは、**Turso側でJWKSエンドポイントがデータベースに関連付けられていない**可能性が高いです。組織レベルでJWKSが登録されていても、データベースレベルで有効化されていない可能性があります。

## 参考リンク

- [Turso Authorization Documentation](https://docs.turso.tech/connect/authorization)
- [Turso JavaScript Client](https://docs.turso.tech/clients/javascript)
- [Turso HTTP API Reference](https://docs.turso.tech/sdk/http/reference)
- [Clerk JWT Templates](https://clerk.com/docs/backend-requests/making/jwt-templates)
- [Turso Discord Community](https://discord.gg/turso) - サポートや質問に使用

## 追加のサポート

問題が解決しない場合：

1. **Turso Discordコミュニティ**で質問
   - [Turso Discord](https://discord.gg/turso) で質問
   - エラーメッセージ、データベース名、リクエストヘッダーを含めて報告
   - 問い合わせテンプレート: [turso-support-request.md](./turso-support-request.md) を参照
   
2. **Tursoサポート**に問い合わせ
   - [Turso Support](https://turso.tech/support) から問い合わせ
   - 問い合わせテンプレート: [turso-support-request.md](./turso-support-request.md) を使用

3. **代替案: プロキシサーバーの実装**
   - ブラウザから直接Tursoに接続する代わりに、バックエンドAPIサーバーを経由する
   - この場合、CORSはバックエンドサーバー（例: Cloudflare Workers、Vercel Functions）で制御可能
