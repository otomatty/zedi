# Railway MCP による CI/CD 設定の調査

**実施日:** 2026-03-02  
**目的:** Railway 側で CI/CD を実現するため、Railway MCP を使用して設定できるかを調査する。

---

## 1. 調査結果サマリー

| 項目                                  | 結論                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Railway MCP で CI/CD 設定が可能か** | ❌ **不可**（GitHub 連携・ブランチトリガー・Wait for CI の設定は MCP ツールに含まれていない） |
| **Railway MCP でできること**          | デプロイ実行、環境変数設定、ログ取得、プロジェクト/環境/サービスの一覧・作成・リンクなど      |
| **CI/CD 設定の方法**                  | Railway Dashboard の Service Settings で**手動設定**が必要                                    |

---

## 2. Railway MCP Server とは

- **正式名称:** Railway MCP Server（`@railway/mcp-server`）
- **リポジトリ:** https://github.com/railwayapp/railway-mcp-server
- **ドキュメント:** https://docs.railway.com/reference/mcp-server
- **仕組み:** Model Context Protocol (MCP) により、AI アシスタントや IDE から Railway CLI 経由で Railway リソースを操作

### 2.1 インストール（Cursor）

`.cursor/mcp.json` に以下を追加:

```json
{
  "mcpServers": {
    "railway-mcp-server": {
      "command": "npx",
      "args": ["-y", "@railway/mcp-server"]
    }
  }
}
```

**前提条件:** Railway CLI のインストールと認証（`railway login`）が必要。

---

## 3. Railway MCP が提供するツール

| カテゴリ                      | ツール                    | 説明                                   |
| ----------------------------- | ------------------------- | -------------------------------------- |
| **Project Management**        | `list-projects`           | プロジェクト一覧                       |
|                               | `create-project-and-link` | プロジェクト作成＆リンク               |
| **Service Management**        | `list-services`           | サービス一覧                           |
|                               | `link-service`            | サービスをカレントディレクトリにリンク |
|                               | `deploy`                  | サービスをデプロイ（railway up 相当）  |
|                               | `deploy-template`         | テンプレートからデプロイ               |
| **Environment Management**    | `create-environment`      | 環境を作成                             |
|                               | `link-environment`        | 環境をリンク                           |
| **Configuration & Variables** | `list-variables`          | 環境変数一覧                           |
|                               | `set-variables`           | 環境変数を設定                         |
|                               | `generate-domain`         | ドメインを生成                         |
| **Monitoring & Logs**         | `get-logs`                | ビルド/デプロイログを取得              |
| **Status**                    | `check-railway-status`    | CLI インストール・認証確認             |

---

## 4. CI/CD 関連で MCP に**含まれない**機能

Railway の GitHub 連携による CI/CD において、以下の設定は **MCP のツールでは操作できない**:

| 機能               | 説明                                 | 設定方法                                            |
| ------------------ | ------------------------------------ | --------------------------------------------------- |
| **Connect Repo**   | サービスを GitHub リポジトリに接続   | Railway Dashboard → Service Settings → Connect Repo |
| **Trigger Branch** | デプロイをトリガーするブランチの指定 | Service Settings → トリガーブランチを選択           |
| **Wait for CI**    | GitHub Actions 完了後にデプロイする  | Service Settings → Wait for CI フラグ               |
| **Disconnect**     | リポジトリ連携の解除                 | Service Settings → Disconnect                       |

これらは Railway の **Dashboard（Web UI）** または **Public API（GraphQL）** で行う必要がある。

---

## 5. Railway 側 CI/CD の仕組み

Railway が GitHub と連携している場合:

1. **サービスを GitHub リポジトリに接続**（Dashboard で設定）
2. **トリガーブランチを指定**（例: develop → development 環境、main → production 環境）
3. **Wait for CI** を有効化すると、GitHub Actions が成功するまでデプロイを待機
4. push が検知されると、Railway がビルド＆デプロイを実行

→ この一連の設定は **Dashboard での手動操作** が必要。MCP では代替できない。

---

## 6. Railway Public API の可能性

Railway の [Public API](https://docs.railway.com/integrations/api/manage-services) には次が含まれる:

- **Connect a service to a repo** — サービスを GitHub リポジトリに接続
- **Update service instance settings** — ビルド/デプロイ設定の更新

ただし:

- Railway MCP Server はこれらの API を**ラップしていない**（CLI ベースの操作のみ）
- MCP を拡張するか、別のスクリプトで GraphQL API を直接叩く必要がある

---

## 7. 推奨アクション

### 7.1 Railway 側 CI/CD を使う場合（RAILWAY_TOKEN 不要にする）

1. **Railway Dashboard** で以下を手動設定:
   - api サービス: develop ブランチに接続（development 環境）
   - api サービス: main ブランチに接続（production 環境）
   - hocuspocus も同様
   - **Wait for CI** を有効化（GitHub Actions の migrate が成功後にデプロイするため）

2. **GitHub Actions ワークフロー** から `railway up` を削除:
   - deploy-api、deploy-hocuspocus ジョブを削除
   - migrate と deploy-frontend のみ残す
   - RAILWAY_TOKEN は不要になる

### 7.2 Railway MCP の活用

- CI/CD 設定には使えないが、以下の用途では利用可能:
  - 環境変数の一括設定・確認
  - デプロイの手動トリガー（`deploy` ツール）
  - ログの取得と確認
  - 開発環境のセットアップ（create-environment、deploy-template 等）

---

## 8. 関連リンク

| リソース                              | URL                                                       |
| ------------------------------------- | --------------------------------------------------------- |
| Railway MCP Server ドキュメント       | https://docs.railway.com/reference/mcp-server             |
| Railway MCP Server リポジトリ         | https://github.com/railwayapp/railway-mcp-server          |
| GitHub Autodeploys ガイド             | https://docs.railway.app/guides/github-autodeploys        |
| Railway Public API（Manage Services） | https://docs.railway.com/integrations/api/manage-services |
