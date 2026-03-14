# 仕様書: Chrome拡張専用 API スコープ（Capability）

## 1. 概要

| 項目     | 内容                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| **対象** | Chrome 拡張機能が zedi API を呼び出す際の認可単位                                    |
| **目的** | 拡張トークンに capability を紐付け、最小権限で動作させる                             |
| **参照** | [chrome-extension-phase2-auth.md](../investigations/chrome-extension-phase2-auth.md) |

---

## 2. スコープ定義

拡張専用 API は capability-based 設計とする。各エンドポイントは必要なスコープを要求し、トークンに含まれるスコープのみ呼び出し可能とする。

### 2.1 スコープ一覧

| スコープ ID      | 説明                         | 対応エンドポイント（予定）          |
| ---------------- | ---------------------------- | ----------------------------------- |
| `clip:create`    | クリップしてページを新規作成 | `POST /api/ext/clip-and-create`     |
| `page:append`    | 既存ページにコンテンツを追加 | （将来）`POST /api/ext/page/append` |
| `page:read`      | ページ情報の読み取り         | （将来）`GET /api/ext/page/:id`     |
| `summarize:run`  | 要約・AI 処理の実行          | （将来）`POST /api/ext/summarize`   |
| `search:run`     | ページ検索                   | （将来）`GET /api/ext/search`       |
| `workspace:list` | ワークスペース一覧取得       | （将来）`GET /api/ext/workspaces`   |

### 2.2 初期リリースで使用するスコープ

Phase 2 ワンクリック保存の初期リリースでは、以下を発行する。

- **`clip:create`** のみ

他のスコープは将来機能の拡張時に追加する。

### 2.3 スコープの紐付け

- OAuth 2.0 + PKCE でトークン発行時、サーバーは「拡張用」であることを識別し、適切なスコープセットを付与する
- トークンの JWT `scope` claim、または専用の `extension_capabilities` claim にスコープ配列を格納
- 各エンドポイントのミドルウェアで、リクエストの Bearer トークンからスコープを検証し、不足していれば `403 Forbidden` を返す

---

## 3. エンドポイントとスコープの対応

### 3.1 現在定義済み

| エンドポイント                  | 方法 | 必須スコープ  | 用途                          |
| ------------------------------- | ---- | ------------- | ----------------------------- |
| `POST /api/ext/session`         | -    | なし（公開）  | OAuth code 交換・リフレッシュ |
| `POST /api/ext/clip-and-create` | POST | `clip:create` | ワンクリック保存              |

### 3.2 将来追加候補

| エンドポイント                  | 方法 | 必須スコープ     | 用途                       |
| ------------------------------- | ---- | ---------------- | -------------------------- |
| `POST /api/ext/page/:id/append` | POST | `page:append`    | 既存ページに選択範囲を追記 |
| `GET /api/ext/page/:id`         | GET  | `page:read`      | ページメタデータ取得       |
| `POST /api/ext/summarize`       | POST | `summarize:run`  | 要約・タグ提案の非同期実行 |
| `GET /api/ext/search`           | GET  | `search:run`     | 保存先候補の検索           |
| `GET /api/ext/workspaces`       | GET  | `workspace:list` | ワークスペース一覧         |

---

## 4. トークン発行時のスコープ付与

- 初回 OAuth 認証時、拡張は `scope` パラメータに `openid` 等の必須スコープのみ送信
- サーバー側で「Chrome 拡張からの認証」であることを検知（redirect_uri 等）し、`extension_capabilities: ["clip:create"]` を付与した拡張専用トークンを発行
- リフレッシュ時も同様のスコープを維持する

---

## 5. 参照

- [chrome-extension-phase2-auth.md](../investigations/chrome-extension-phase2-auth.md)
- [chrome-extension-future-features.md](./chrome-extension-future-features.md)
