> **Language:** English | [日本語](README.ja.md)

# Zedi MCP Server

Model Context Protocol (MCP) server for Zedi. Exposes MCP tools so external clients (e.g. Claude Code) can read and write pages, notes, search, and clips in your Zedi workspace.

---

## Overview

- **stdio transport** (`zedi-mcp-stdio`): stdio entry point for local Claude Code registration. Reads tokens from environment variables or `~/.config/zedi/mcp.json`.
- **HTTP transport** (`zedi-mcp-http`): Streamable HTTP server for Railway deployment. Identifies users via `Authorization: Bearer <MCP JWT>`.
- **CLI** (`zedi-mcp-cli`): Helper CLI that obtains an MCP JWT via PKCE and saves it to the user config file.

Related PRs / issues: #554, #555, #556, #558.

---

## Prerequisites

- Zedi API server (`server/api`) running and reachable
  - Default: `https://api.zedi.app`
  - Local dev: `http://localhost:3000`, etc.
- Zedi user account (logged in via Better Auth)
- Bun v1.3+ (development) / Node.js v20+ (stdio runtime)

---

## Install

When developing in the repository:

```bash
cd server/mcp
bun install
bun run build   # Generates dist/stdio.js, dist/http.js, dist/cli/login.js
```

To try stdio or CLI in one shot (local build required; package not published yet):

```bash
cd server/mcp && bun run build
node dist/stdio.js          # stdio server
node dist/cli/login.js      # CLI (login / whoami)
```

---

## 1. Issuing an MCP token

The MCP server authorizes with JWTs issued by the Zedi API (`scope`: `mcp:read` / `mcp:write`). Two ways to obtain a token:

### 1a. Manual script (developers / operators)

```bash
cd server/api
# No scope argument = mcp:read + mcp:write
bun run scripts/issue-mcp-token.ts <userId>

# Restrict scopes
bun run scripts/issue-mcp-token.ts <userId> mcp:read
bun run scripts/issue-mcp-token.ts <userId> mcp:read,mcp:write
```

Required environment variables (auto-loaded from root `.env`):

| Variable             | Purpose                                |
| -------------------- | -------------------------------------- |
| `BETTER_AUTH_SECRET` | JWT signing key (required)             |
| `MCP_JWT_EXP_DAYS`   | Expiry in days (default 30 if omitted) |

Output is JSON with the JWT in `access_token`. The manual script is for CI and operators. For day-to-day use, prefer PKCE login below.

### 1b. PKCE login (regular users)

When `/mcp/authorize` and `/api/mcp/session` are available on the API, use the bundled CLI:

```bash
cd server/mcp && bun run build

# Login against default (https://api.zedi.app)
node dist/cli/login.js login

# Explicit API URL
node dist/cli/login.js login --api-url http://localhost:3000

# Verify saved token
node dist/cli/login.js whoami
```

The CLI opens a browser to `/mcp/authorize?...`. After approval, it receives `code` on a local callback, POSTs to `/api/mcp/session` with `code_verifier`, and saves `access_token` to:

- macOS / Linux: `$XDG_CONFIG_HOME/zedi/mcp.json` (default `~/.config/zedi/mcp.json`)
- Windows: `%APPDATA%\zedi\mcp.json`

File permissions are written as `0600`.

---

## 2. Register the stdio server in Claude Code

Add to `mcpServers` in Claude Code config (`~/.claude.json`):

### 2a. Logged in (config file)

After `zedi-mcp-cli login`, stdio reads `apiUrl` and `token` from `~/.config/zedi/mcp.json` — no env vars needed.

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

### 2b. Environment variables (CI / multiple accounts)

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

Environment variables override the config file. If neither is set, stdio exits with an error on stderr.

After registration, restart Claude Code. Tools such as `zedi_get_current_user` should appear. Verify:

```
> Call zedi_get_current_user
```

Success returns user info as JSON.

---

## 3. Deploy HTTP transport on Railway

For remote MCP access, deploy `server/mcp` as a Railway service with HTTP transport.

### 3a. Railway configuration

1. Create a service with **Root Directory** `server/mcp` (uses bundled `railway.json` and `Dockerfile`).
2. Environment variables:

   | Variable       | Required    | Purpose                                                                                 |
   | -------------- | ----------- | --------------------------------------------------------------------------------------- |
   | `ZEDI_API_URL` | Recommended | Backend REST API URL, e.g. `http://api.railway.internal:3000` or `https://api.zedi.app` |
   | `PORT`         | Optional    | Listen port (default `3100`; Railway injects automatically)                             |
   | `MCP_HOST`     | Optional    | Bind host (default `0.0.0.0`)                                                           |

3. **Healthcheck**: `railway.json` monitors `/health` with 30s timeout.
4. **Start command**: `node dist/http.js` (set in Dockerfile `CMD` and `railway.json`).

Client endpoint: `https://<railway-domain>/mcp`. Health: `/health`.

### 3b. Client (HTTP transport)

Use HTTP transport settings in Claude Code `mcpServers`. Set `Authorization` header with JWT:

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

The server is stateless (new `McpServer` per request), so the same JWT can be used from multiple clients without session conflicts.

---

## 4. Available tools

All tools call the Zedi API (`server/api`) via `HttpZediClient`. Exact input/output types are in Zod schemas in `src/tools/index.ts` (source of truth).

### User

| Tool                    | Summary                                             |
| ----------------------- | --------------------------------------------------- |
| `zedi_get_current_user` | Returns authenticated user `id` / `email` / `name`. |

### Pages

| Tool               | Summary                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `zedi_get_page`    | Read-only page body (`content_text`) and metadata. Does not include Y.Doc bytes. |
| `zedi_create_page` | Create a new page (empty Y.Doc).                                                 |
| `zedi_delete_page` | Soft-delete a page.                                                              |

> Issue #889 Phase 5 removed only the page-body update tool (`zedi_update_page_content`) from MCP. Other write tools (note creation, membership, etc.) remain. Edit page bodies via the Zedi client (Hocuspocus real-time editing).

### Notes

| Tool               | Summary                                                      |
| ------------------ | ------------------------------------------------------------ |
| `zedi_list_notes`  | Notes where you are owner or member.                         |
| `zedi_get_note`    | Note details including pages and your role.                  |
| `zedi_create_note` | Create a note (default private + owner-only edit).           |
| `zedi_update_note` | Update note metadata (title / visibility / edit_permission). |
| `zedi_delete_note` | Soft-delete a note.                                          |

### Note pages

| Tool                         | Summary                               |
| ---------------------------- | ------------------------------------- |
| `zedi_list_note_pages`       | Pages in a note in order.             |
| `zedi_add_page_to_note`      | Add existing page or create and add.  |
| `zedi_remove_page_from_note` | Remove page from note (page remains). |
| `zedi_reorder_note_pages`    | Reorder with full `page_ids` list.    |

### Note members

| Tool                      | Summary                                  |
| ------------------------- | ---------------------------------------- |
| `zedi_list_note_members`  | Members with role and acceptance status. |
| `zedi_add_note_member`    | Invite member by email.                  |
| `zedi_update_note_member` | Update member role.                      |
| `zedi_remove_note_member` | Remove member.                           |

### Search / clip

| Tool            | Summary                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `zedi_search`   | Full-text search on title and body. `scope: own` or `shared`, `limit`. |
| `zedi_clip_url` | Fetch public URL via Readability and save as new page.                 |

20 tools total. See `ALL_TOOL_NAMES` in `src/tools/index.ts`.

---

## 5. Troubleshooting

### "No token configured" on stderr and stdio exits

Neither `ZEDI_MCP_TOKEN` nor `~/.config/zedi/mcp.json` is set. Run `zedi-mcp-cli login` or set token in `~/.claude.json` `env`.

### Tool calls return 401 / 403

- Token expired (`MCP_JWT_EXP_DAYS`). Re-run `zedi-mcp-cli login`.
- Insufficient scope. Write tools require `mcp:write`. Issue `mcp:read,mcp:write` via `issue-mcp-token.ts` or CLI login defaults.
- `ZEDI_API_URL` points to a different API than the one that issued the token (signing key mismatch).

### Cannot connect to HTTP transport

- Verify `curl https://<railway-domain>/health` returns `{ "ok": true, ... }`.
- Confirm Claude Code config has `type: "http"` and `Authorization` header.
- For Railway internal API, set `ZEDI_API_URL` to internal URL (e.g. `http://api.railway.internal:3000`).

### Do not log to stdout on stdio

JSON-RPC uses stdout. Logs go to stderr only. Do not add `console.log` to stdout in patches.

---

## 6. Development

```bash
cd server/mcp

bun install
bun run dev:stdio     # tsx watch src/stdio.ts
bun run dev:http      # tsx watch src/http.ts
bun run typecheck     # tsc --noEmit
bun run test          # vitest run
```

Tests live under `src/__tests__/`. When adding tools, add Zod schemas and Vitest tests (TDD — see [AGENTS.md](../../AGENTS.md)).

---

## Related

- `server/api` — MCP JWT issuance and auth endpoints (`/mcp/authorize`, `/api/mcp/session`)
- `server/hocuspocus` — Real-time Y.Doc sync for page bodies
- Issues: [#554](https://github.com/otomatty/zedi/issues/554), [#555](https://github.com/otomatty/zedi/issues/555), [#556](https://github.com/otomatty/zedi/issues/556), [#558](https://github.com/otomatty/zedi/issues/558)
