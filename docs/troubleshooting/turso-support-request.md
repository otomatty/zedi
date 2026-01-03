# Tursoサポートへの問い合わせテンプレート

## 問題の概要

ブラウザからTursoデータベースに接続する際、401 Unauthorizedエラーが発生しています。JWTトークンは正しく生成されており、必要なクレームもすべて含まれていますが、認証に失敗しています。

## 環境情報

- **Turso CLIバージョン**: v1.0.15
- **データベース名**: `zedi`
- **データベースURL**: `libsql://zedi-otomatty.aws-ap-northeast-1.turso.io`
- **HTTP URL**: `https://zedi-otomatty.aws-ap-northeast-1.turso.io`
- **データベースID**: `33057661-834e-4891-9b48-802d425d02b9`
- **組織名**: `otomatty`

## 認証設定

### JWKSエンドポイント

組織レベルで以下のJWKSエンドポイントが登録されています：

```bash
$ turso org jwks list
NAME                 URL                                               
Clerk Production     https://clerk.type-flow.app/.well-known/jwks.json     
Zedi Clerk           https://clerk.zedi-note.app/.well-known/jwks.json     
```

使用しているJWKSエンドポイント: `Zedi Clerk` → `https://clerk.zedi-note.app/.well-known/jwks.json`

### JWTテンプレート

```bash
$ turso org jwks template --database zedi --scope full-access
{"a":"rw","id":"33057661-834e-4891-9b48-802d425d02b9","perm":[],"rid":"b2043790-8e2f-46f1-993e-13f45705af34"}
```

### JWTトークンの内容

実際に送信されているJWTトークンのペイロード：

```json
{
  "a": "rw",
  "azp": "https://zedi-note.app",
  "exp": 1767409368,
  "iat": 1767409308,
  "id": "33057661-834e-4891-9b48-802d425d02b9",
  "iss": "https://clerk.zedi-note.app",
  "jti": "e3410c9f8c9320fbec8f",
  "nbf": 1767409303,
  "perm": [],
  "rid": "b2043790-8e2f-46f1-993e-13f45705af34",
  "sub": "user_37jAIdMFr4gzT466LyJEhpchQMa"
}
```

## エラー詳細

### リクエスト情報

- **URL**: `https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline`
- **メソッド**: POST
- **ステータス**: 401 Unauthorized
- **Origin**: `https://zedi-note.app`
- **Authorizationヘッダー**: 含まれている ✓

### エラーメッセージ

```
POST https://zedi-otomatty.aws-ap-northeast-1.turso.io/v2/pipeline net::ERR_FAILED 401 (Unauthorized)
```

## 確認済み事項

✅ **JWTトークンは正しく生成されている**
- 必要なクレーム（`a`, `id`, `perm`, `rid`）がすべて含まれている
- データベースID (`id`) が一致している
- 有効期限もまだ有効

✅ **JWKSエンドポイントはアクセス可能**
- `https://clerk.zedi-note.app/.well-known/jwks.json` は正しく応答している
- 公開鍵も正しく取得できる

✅ **組織レベルでJWKSが登録されている**
- `Zedi Clerk` という名前でJWKSエンドポイントが登録されている

## 問題の可能性

1. **データベースにJWKSが関連付けられていない**
   - 組織レベルでJWKSが登録されていても、データベースレベルで有効化されていない可能性
   - Turso CLI v1.0.15では、データベースにJWKSを関連付けるコマンド（`turso db auth jwks attach`など）が見つかりません

2. **リソースID (`rid`) の不一致**
   - JWTトークンには `rid: "b2043790-8e2f-46f1-993e-13f45705af34"` が含まれている
   - データベースのリソースIDと一致しているか確認が必要

## 質問

1. **データベースにJWKSエンドポイントを関連付ける方法はありますか？**
   - 組織レベルでJWKSが登録されていれば、自動的にすべてのデータベースで使用できるのでしょうか？
   - それとも、データベースレベルで有効化する必要がありますか？

2. **データベースのリソースID (`rid`) を確認する方法はありますか？**
   - `turso db show zedi` コマンドではリソースIDが表示されません
   - JWTトークンの `rid` と一致しているか確認したいです

3. **401エラーの原因を特定する方法はありますか？**
   - より詳細なエラーメッセージを取得する方法はありますか？
   - ログを確認する方法はありますか？

## 期待される動作

ブラウザから `https://zedi-note.app` でTursoデータベースに接続し、ClerkのJWTトークンを使用して認証できること。

## 参考リンク

- [Turso Authorization Documentation](https://docs.turso.tech/connect/authorization)
- [Turso JavaScript Client](https://docs.turso.tech/clients/javascript)
