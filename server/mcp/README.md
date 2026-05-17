# Zedi MCP Server

Zedi の Model Context Protocol (MCP) サーバー。Claude Code などの外部 MCP クライアントから Zedi のページ / ノート / 検索 / クリップといったデータを操作できるツールを公開する。

Model Context Protocol (MCP) server for Zedi. Exposes Zedi pages, notes, search, and clipping as MCP tools so that external clients (e.g. Claude Code) can read and write your Zedi workspace.

---

## 概要 / Overview

- **stdio transport** (`zedi-mcp-stdio`): ローカルの Claude Code などに登録する用の stdio エントリポイント。環境変数または `~/.config/zedi/mcp.json` からトークンを読む。
- **HTTP transport** (`zedi-mcp-http`): Railway などにデプロイして、リモートからも MCP 接続を受け付けるストリーマブル HTTP サーバー。`Authorization: Bearer <MCP JWT>` ヘッダでユーザを識別する。
- **CLI** (`zedi-mcp-cli`): PKCE フローで MCP JWT を取得し、ユーザー設定ファイルに保存する補助 CLI。

Related PRs / issues: #554, #555, #556, #558.

---

## 前提条件 / Prerequisites

- Zedi の API サーバー (`server/api`) が起動済みで到達できる URL を持っていること
  - デフォルト: `https://api.zedi.app`
  - ローカル開発では `http://localhost:3000` など
- Zedi のユーザーアカウント (Cognito 経由でログイン済み)
- Bun v1.3 以上 (開発時) / Node.js v20 以上 (stdio 実行時)

---

## インストール / Install

リポジトリ内で開発する場合:

```bash
cd server/mcp
bun install
bun run build   # dist/stdio.js, dist/http.js, dist/cli/login.js を生成
```

ワンショットで stdio や CLI を試したいだけなら、`bunx` で直接起動することもできる (未公開パッケージのため、現時点ではローカルビルドを前提):

```bash
cd server/mcp && bun run build
node dist/stdio.js          # stdio サーバー
node dist/cli/login.js      # CLI (login / whoami)
```

---

## 1. MCP トークンの発行 / Issuing an MCP token

MCP サーバーは Zedi API が発行する JWT (`scope`: `mcp:read` / `mcp:write`) を使って認可する。トークンを手に入れる方法は 2 通り。

### 1a. 手動スクリプトで発行する (開発者向け)

```bash
cd server/api
# スコープ指定なし = mcp:read + mcp:write
bun run scripts/issue-mcp-token.ts <userId>

# スコープを絞る
bun run scripts/issue-mcp-token.ts <userId> mcp:read
bun run scripts/issue-mcp-token.ts <userId> mcp:read,mcp:write
```

必要な環境変数 (ルート `.env` から自動読込):

| 変数                 | 用途                       |
| -------------------- | -------------------------- |
| `BETTER_AUTH_SECRET` | JWT 署名鍵 (必須)          |
| `MCP_JWT_EXP_DAYS`   | 有効期限 (日数、省略時 30) |

出力は JSON で、`access_token` フィールドに JWT が入っている。手動スクリプトは CI 用・運用者用。開発者本人が普段使うなら下の PKCE ログインを推奨する。

### 1b. PKCE フローでログインする (通常ユーザー向け)

Zedi API に `/mcp/authorize` と `/api/mcp/session` が実装されている環境なら、付属 CLI を使って OAuth 的に JWT を取得できる。

```bash
cd server/mcp && bun run build

# デフォルト (https://api.zedi.app) に対してログイン
node dist/cli/login.js login

# API URL を明示する場合
node dist/cli/login.js login --api-url http://localhost:3000

# ログイン済みトークンでプロフィールを確認
node dist/cli/login.js whoami
```

CLI はブラウザを開いて `/mcp/authorize?...` に飛ばし、ユーザーが Zedi 側で承認するとローカルコールバックに `code` を受け取る。続けて `/api/mcp/session` に `code_verifier` とともに POST し、返ってきた `access_token` を以下に保存する:

- macOS / Linux: `$XDG_CONFIG_HOME/zedi/mcp.json` (未設定時は `~/.config/zedi/mcp.json`)
- Windows: `%APPDATA%\zedi\mcp.json`

ファイルのパーミッションは `0600` で書き込まれる。

---

## 2. Claude Code に stdio サーバーを登録する / Register the stdio server in Claude Code

Claude Code の設定ファイル (`~/.claude.json`) の `mcpServers` に以下のように追記する。

### 2a. ログイン済み (config ファイル利用) パターン

`zedi-mcp-cli login` を済ませていれば、stdio サーバーは自動的に `~/.config/zedi/mcp.json` から `apiUrl` と `token` を読むので、環境変数の設定は不要。

```json
{
  "mcpServers": {
    "zedi": {
      "command": "node",
      "args": ["/absolute/path/to/zedi/server/mcp/dist/stdio.js"]
    }
  }
}
```

### 2b. 環境変数で渡すパターン (CI や複数アカウント切り替え向け)

```json
{
  "mcpServers": {
    "zedi": {
      "command": "node",
      "args": ["/absolute/path/to/zedi/server/mcp/dist/stdio.js"],
      "env": {
        "ZEDI_API_URL": "https://api.zedi.app",
        "ZEDI_MCP_TOKEN": "<paste access_token here>"
      }
    }
  }
}
```

環境変数は config ファイルより優先される。どちらも未設定なら stdio サーバーはエラーを stderr に出して終了する。

登録後、Claude Code を再起動すると `zedi_get_current_user` 等のツールが使えるようになる。確認方法:

```
> zedi_get_current_user を呼び出してみて
```

成功すれば JSON 形式のユーザー情報が返る。

---

## 3. HTTP サーバーを Railway にデプロイする / Deploy HTTP transport on Railway

リモートから Claude Code に MCP を接続したい場合は、`server/mcp` ディレクトリを Railway サービスとして切り出し、HTTP transport をデプロイする。

### 3a. Railway 側の設定

1. 新規サービスを作成し、**Root Directory** を `server/mcp` に設定する (付属 `railway.json` と `Dockerfile` が自動で使われる)。
2. 環境変数:
   | 変数 | 必須 | 用途 |
   | ---- | ---- | ---- |
   | `ZEDI_API_URL` | 推奨 | バックエンド REST API の URL。例: `http://api.railway.internal:3000` (内部通信) / `https://api.zedi.app` (公開) |
   | `PORT` | 任意 | 待ち受けポート (デフォルト `3100`、Railway は自動で注入) |
   | `MCP_HOST` | 任意 | バインドホスト (デフォルト `0.0.0.0`) |
3. **Healthcheck**: `railway.json` にて `/health` を 30 秒タイムアウトで監視する設定を同梱済み。
4. **Start command**: `node dist/http.js` (Dockerfile の `CMD` と `railway.json` の `startCommand` で二重指定済み)。

デプロイ後、クライアントからの接続先は `https://<railway-domain>/mcp` になる。ヘルスチェック用に `/health` も利用可。

### 3b. クライアント側 (HTTP transport 経由で使う場合)

Claude Code の `mcpServers` では、HTTP transport 向け設定を使う。`Authorization` ヘッダに JWT を入れる点に注意。

```json
{
  "mcpServers": {
    "zedi-remote": {
      "type": "http",
      "url": "https://<railway-domain>/mcp",
      "headers": {
        "Authorization": "Bearer <paste access_token here>"
      }
    }
  }
}
```

サーバーはステートレス (リクエストごとに新しい `McpServer` を生成) なので、同じ JWT を複数クライアントから同時に使ってもセッションが競合しない。

---

## 4. 公開されているツール / Available tools

すべて Zedi API (`server/api`) を `HttpZediClient` 経由で呼び出す。入出力の厳密な型は `src/tools/index.ts` の Zod スキーマを参照 (これが唯一の正 / source of truth)。

### ユーザー

| ツール名                | 概要                                                |
| ----------------------- | --------------------------------------------------- |
| `zedi_get_current_user` | 認証済みユーザーの `id` / `email` / `name` を返す。 |

### ページ

| ツール名           | 概要                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `zedi_get_page`    | 単一ページの本文 (`content_text`) とメタデータを読み取り専用で取得。Y.Doc バイト列は含まない。 |
| `zedi_create_page` | 新規ページを作成 (Y.Doc は空)。                                                                |
| `zedi_delete_page` | ページをソフトデリートする。                                                                   |

> Issue #889 Phase 5 で MCP は read-only に縮退しました。ページ本文の更新は Zedi クライアント (Hocuspocus 経由のリアルタイム編集) から行ってください。`zedi_update_page_content` は廃止されました。
>
> _Issue #889 Phase 5 made MCP read-only. To edit a page body, use the Zedi web/desktop client which writes through Hocuspocus. The retired tool was `zedi_update_page_content`._

### ノート

| ツール名           | 概要                                                               |
| ------------------ | ------------------------------------------------------------------ |
| `zedi_list_notes`  | 自分がオーナーまたはメンバーのノート一覧。                         |
| `zedi_get_note`    | ノート詳細 (ページ一覧・自分のロール含む) を返す。                 |
| `zedi_create_note` | 新規ノートを作成 (デフォルトは private + owner-only edit)。        |
| `zedi_update_note` | ノートのメタデータ (title / visibility / edit_permission) を更新。 |
| `zedi_delete_note` | ノートをソフトデリート。                                           |

### ノート内ページ

| ツール名                     | 概要                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `zedi_list_note_pages`       | ノート内ページを並び順で返す。                             |
| `zedi_add_page_to_note`      | 既存ページをノートに追加、または新規ページを作成して追加。 |
| `zedi_remove_page_from_note` | ノートからページをはずす (ページ自体は残る)。              |
| `zedi_reorder_note_pages`    | ノート内ページの並びを `page_ids` で全指定して並べ替え。   |

### ノートメンバー

| ツール名                  | 概要                                              |
| ------------------------- | ------------------------------------------------- |
| `zedi_list_note_members`  | ノートメンバー一覧 (ロール・承諾ステータス付き)。 |
| `zedi_add_note_member`    | email でメンバーを招待。                          |
| `zedi_update_note_member` | メンバーのロールを更新。                          |
| `zedi_remove_note_member` | メンバーを削除。                                  |

### 検索 / クリップ

| ツール名        | 概要                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `zedi_search`   | タイトルと本文で全文検索。`scope: own` or `shared`、`limit` を指定可能。 |
| `zedi_clip_url` | 公開 URL を Readability で整形し、新規ページとして保存。                 |

計 19 ツール。ツール名の一覧は `src/tools/index.ts` の `ALL_TOOL_NAMES` にも定義済み。

---

## 5. トラブルシューティング / Troubleshooting

### "No token configured" が stderr に出て stdio サーバーが終了する

`ZEDI_MCP_TOKEN` 環境変数も `~/.config/zedi/mcp.json` もどちらも存在しない状態。`zedi-mcp-cli login` を実行するか、`~/.claude.json` の `env` にトークンを書く。

### ツール呼び出しが 401 / 403 を返す

- トークンの有効期限が切れている (`MCP_JWT_EXP_DAYS` 日で失効)。`zedi-mcp-cli login` でトークンを再発行する。
- スコープが足りない。書き込み系ツール (`zedi_create_note`, `zedi_add_page_to_note` など) は `mcp:write` を要求する。`issue-mcp-token.ts` の第 2 引数に `mcp:read,mcp:write` を渡す、もしくは CLI ログイン時に既定の `mcp:read,mcp:write` で発行する。なお Issue #889 Phase 5 以降、ページ本文の更新ツールは MCP から削除されている。
- `ZEDI_API_URL` の指す API サーバーと、トークンを発行した API サーバーが別物 (署名鍵が違う)。同じ環境で発行したトークンを使うこと。

### HTTP transport に接続できない / Claude Code から見えない

- `curl https://<railway-domain>/health` が `{ "ok": true, ... }` を返すか確認。返らない場合はデプロイが立ち上がっていない。
- Claude Code の設定で `type: "http"` と `Authorization` ヘッダが両方指定されているか確認。
- Railway の内部通信を使うとき、`ZEDI_API_URL` は内部 URL (`http://api.railway.internal:3000` 等) を指す必要がある。外向き URL を設定すると自己呼び出しでループする可能性がある。

### HTTPS でない stdio 出力でクライアントが壊れる

stdio transport では JSON-RPC が stdout に流れるため、**ログは必ず stderr に出している**。独自パッチで stdout に `console.log` を追加しないこと。

---

## 6. 開発 / Development

```bash
cd server/mcp

bun install
bun run dev:stdio     # tsx watch src/stdio.ts
bun run dev:http      # tsx watch src/http.ts
bun run typecheck     # tsc --noEmit
bun run test          # vitest run
```

テストは `src/__tests__/` 以下。ツール追加時は必ず Zod スキーマと Vitest のテストを合わせて追加すること (TDD / リポジトリ共通方針は [AGENTS.md](../../AGENTS.md) を参照)。

---

## Related

- `server/api` — MCP JWT 発行・認可エンドポイント (`/mcp/authorize`, `/api/mcp/session`) を提供する。
- `server/hocuspocus` — ページ本文 (Y.Doc) のリアルタイム同期サーバー。
- Issues: [#554](https://github.com/otomatty/zedi/issues/554), [#555](https://github.com/otomatty/zedi/issues/555), [#556](https://github.com/otomatty/zedi/issues/556), [#558](https://github.com/otomatty/zedi/issues/558).
