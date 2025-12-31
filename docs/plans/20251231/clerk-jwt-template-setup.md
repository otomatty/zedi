# Clerk JWT Template 設定ガイド（Turso 連携用）

**目的:** Clerk から Turso 認証に使用する JWT トークンを発行するためのテンプレートを設定する

---

## 概要

Turso はベータ期間中、**Clerk**と**Auth0**を OIDC プロバイダーとしてサポートしています。
Clerk で JWT Template を設定することで、ユーザーごとの JWT トークンを発行し、Turso データベースへのアクセス制御が可能になります。

---

## 手順

### Step 1: Clerk Dashboard で JWT Template を作成

1. [Clerk Dashboard](https://dashboard.clerk.com/) にログイン
2. 対象のアプリケーションを選択
3. 左メニューから **JWT Templates** を選択
4. **+ New template** をクリック
5. **Blank** テンプレートを選択

---

### Step 2: テンプレートの設定

#### 基本設定

| 項目               | 値                          |
| ------------------ | --------------------------- |
| **Name**           | `turso`                     |
| **Token Lifetime** | `60` (秒) ※必要に応じて調整 |

#### Claims（ペイロード）

Clerk は`sub`、`iat`、`exp`、`iss`、`nbf`、`azp`などの標準 JWT クレームを**自動的に設定**します。
これらを手動で指定するとエラーになるため、カスタムクレームのみを設定します。

以下の JSON を設定:

```json
{}
```

> **注意:** 基本的な Turso 認証では追加の Claims は不要です。空のオブジェクト`{}`で動作します。
> Clerk は標準クレーム（`sub`、`email`、`name`など）を自動的に含めるため、カスタム Claims を追加する必要はありません。

**オプション: カスタムメタデータを含める場合**

ユーザーの`publicMetadata`に設定したカスタムデータのみ追加可能です:

```json
{
  "role": "{{user.public_metadata.role}}",
  "plan": "{{user.public_metadata.plan}}"
}
```

> これらは事前に Clerk Dashboard → Users → 対象ユーザー → Metadata で`publicMetadata`に設定しておく必要があります。

**自動的に含まれる Claims（設定不要・設定不可）:**

- `sub` - ユーザー ID（自動設定）
- `iat` - 発行時刻（自動設定）
- `exp` - 有効期限（自動設定）
- `iss` - 発行者（自動設定）
- `nbf` - 有効開始時刻（自動設定）
- `azp` - Authorized Party（自動設定）

---

### Step 3: Turso CLI で JWKS URL を登録

Clerk Dashboard から JWKS URL を取得し、Turso に登録します。

#### JWKS URL の形式

```
https://<your-clerk-domain>.clerk.accounts.dev/.well-known/jwks.json
```

例: `https://your-app.clerk.accounts.dev/.well-known/jwks.json`

#### Turso CLI で登録

```bash
# JWKSエンドポイントを登録
turso org jwks save clerk https://YOUR_CLERK_DOMAIN/.well-known/jwks.json
```

#### 登録確認

```bash
turso org jwks list
```

---

### Step 4: JWT Permissions の設定（オプション）

Turso データベースへのアクセス権限を細かく制御する場合:

```bash
# データベースへのフルアクセス
turso org jwks template --database <database-name> --scope full-access

# 読み取り専用アクセス
turso org jwks template --database <database-name> --scope read-only

# 細かい権限設定
turso org jwks template \
  --database <database-name> \
  --permissions all:data_read \
  --permissions pages:data_add,data_update \
  --permissions links:data_add
```

**利用可能な権限:**

| 権限            | 説明             |
| --------------- | ---------------- |
| `data_read`     | データの読み取り |
| `data_add`      | データの挿入     |
| `data_update`   | データの更新     |
| `data_delete`   | データの削除     |
| `schema_add`    | テーブルの作成   |
| `schema_update` | スキーマの変更   |
| `schema_delete` | テーブルの削除   |

---

### Step 5: フロントエンドでの使用

#### トークンの取得

```tsx
import { useAuth } from "@clerk/clerk-react";

function MyComponent() {
  const { getToken } = useAuth();

  const fetchData = async () => {
    // "turso" はStep 2で設定したテンプレート名
    const token = await getToken({ template: "turso" });

    // このトークンをTursoクライアントに渡す
    const client = createAuthenticatedTursoClient(token);
    const result = await client.execute("SELECT * FROM pages");
  };
}
```

#### useTurso フックを使用（推奨）

```tsx
import { useTurso } from "@/hooks/useTurso";

function MyComponent() {
  const { getClient, isSignedIn } = useTurso();

  const fetchData = async () => {
    const client = await getClient();
    const result = await client.execute("SELECT * FROM pages");
  };
}
```

---

## トラブルシューティング

### よくあるエラー

#### 1. `JWT verification failed`

**原因:** JWKS エンドポイントが Turso に正しく登録されていない

**解決:**

```bash
turso org jwks list  # 登録状況を確認
turso org jwks save clerk <正しいURL>  # 再登録
```

#### 2. `Token expired`

**原因:** JWT の有効期限が切れている

**解決:**

- JWT Template の `Token Lifetime` を確認
- フロントエンドで `getToken()` を都度呼び出す

#### 3. `Permission denied`

**原因:** JWT に必要な権限が含まれていない

**解決:**

```bash
turso org jwks template --database <db> --scope full-access
```

---

## 参考リンク

- [Clerk JWT Templates](https://clerk.com/docs/backend-requests/making/jwt-templates)
- [Turso Authorization](https://docs.turso.tech/connect/authorization)
- [Turso JWKS Management](https://docs.turso.tech/cli/org/jwks)
