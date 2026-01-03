# Turso JWKS設定確認レポート

## 実行日時
2025年1月2日

## 確認結果

### 1. データベース情報

```bash
$ turso db show zedi
Name:               zedi
URL:                libsql://zedi-otomatty.aws-ap-northeast-1.turso.io
ID:                 33057661-834e-4891-9b48-802d425d02b9
Group:              default
Version:            tech-preview
Locations:          aws-ap-northeast-1
```

**データベースURL**: `libsql://zedi-otomatty.aws-ap-northeast-1.turso.io`
**データベースID**: `33057661-834e-4891-9b48-802d425d02b9`

### 2. JWKSエンドポイント設定

```bash
$ turso org jwks list
NAME                 URL                                               
Clerk Production     https://clerk.type-flow.app/.well-known/jwks.json     
Zedi Clerk           https://clerk.zedi-note.app/.well-known/jwks.json     
```

**登録されているJWKSエンドポイント**:
- `Clerk Production`: `https://clerk.type-flow.app/.well-known/jwks.json`
- `Zedi Clerk`: `https://clerk.zedi-note.app/.well-known/jwks.json`

### 3. JWTテンプレート

```bash
$ turso org jwks template --database zedi --scope full-access
{"a":"rw","id":"33057661-834e-4891-9b48-802d425d02b9","perm":[],"rid":"b2043790-8e2f-46f1-993e-13f45705af34"}
```

**生成されたJWTクレーム**:
```json
{
  "a": "rw",  // アクセス権限: read-write
  "id": "33057661-834e-4891-9b48-802d425d02b9",  // データベースID
  "perm": [],  // 詳細な権限（空の場合は全テーブルに適用）
  "rid": "b2043790-8e2f-46f1-993e-13f45705af34"  // リソースID
}
```

## 次のステップ

### Clerk側の設定確認

1. **Clerkダッシュボードにログイン**
   - [Clerk Dashboard](https://dashboard.clerk.com/)

2. **JWTテンプレートの確認**
   - **JWT Templates** に移動
   - `turso` という名前のテンプレートが存在するか確認
   - 存在しない場合は、上記のJWTクレームを使用して作成

3. **JWTテンプレートの設定**
   - テンプレート名: `turso`
   - クレーム: 上記のJSONを使用
   - JWKS URL: `https://clerk.zedi-note.app/.well-known/jwks.json` が正しく設定されているか確認

### データベースへのJWKS関連付け

**注意**: Turso CLI v1.0.15では、データベースにJWKSを直接関連付けるコマンドが見つかりませんでした。

Tursoの最新のドキュメントによると、JWKSエンドポイントを組織レベルで登録すれば、その組織内のすべてのデータベースで使用できる可能性があります。

### 確認コマンド

以下のコマンドで設定を確認できます：

```bash
# データベース一覧
turso db list

# データベース詳細
turso db show zedi

# JWKSエンドポイント一覧
turso org jwks list

# JWTテンプレート生成
turso org jwks template --database zedi --scope full-access
```

## 問題の可能性

1. **JWKSエンドポイントがデータベースに関連付けられていない**
   - 組織レベルでJWKSが登録されていても、データベースレベルで有効化されていない可能性

2. **ClerkのJWTテンプレートが正しく設定されていない**
   - JWTクレームが上記のテンプレートと一致していない可能性

3. **CORS設定**
   - TursoはJWT認証が正しく機能すれば、自動的にCORSヘッダーを返すはず
   - 401エラーが発生している場合、CORSエラーも同時に発生する可能性

## 推奨される対処法

1. **ClerkのJWTテンプレートを確認・更新**
   - 上記のJWTクレームを使用してテンプレートを作成/更新

2. **Tursoサポートに問い合わせ**
   - データベースにJWKSを関連付ける方法を確認
   - [Turso Discord](https://discord.gg/turso) または [Turso Support](https://turso.tech/support)

3. **ブラウザの開発者ツールで確認**
   - Networkタブでリクエストヘッダーを確認
   - `Authorization: Bearer <token>` が正しく送信されているか確認
   - レスポンスヘッダーに `Access-Control-Allow-Origin` が含まれているか確認
