> **Language:** English | [日本語](README.ja.md)

# Zedi Admin

Admin SPA (admin.zedi-note.app). Provides authentication and AI model management.

## Development

```bash
# First time only
cd admin && npm install

# Start (port 30001; API proxied via ZEDI_API_PROXY_TARGET)
npm run dev
```

From repository root:

```bash
npm run dev:admin
```

## Local verification

The old backend (`server/api`) has been removed, so sign-in and the checks below cannot run until the admin features move to `app/`. Kept as the list of what to check then:

- [ ] Admin UI loads at `http://localhost:30001`
- [ ] After login (Google/GitHub), admin users see the AI model list
- [ ] Non-admin users see an "insufficient permissions" message
- [ ] Model toggle, tier change, and sync work

## Build

```bash
cd admin && npm install && npm run build
```

Output is `admin/dist`. It is no longer deployed: the `deploy-dev.yml` / `deploy-prod.yml` workflows were removed with the old backend. The Cloudflare Pages projects (`zedi-admin`, `zedi-admin-dev`) are still defined in Terraform until it is removed.

## Environment variables

- **Development (local):** Set `ZEDI_API_PROXY_TARGET` in `.env` to proxy `/api` to an API.
- **Build:** `VITE_API_BASE_URL`, `VITE_MAIN_APP_URL` and `VITE_ENV_LABEL` (`production` / `development`; `development` shows a **Development** badge in the sidebar).

## Specification

- Behavior and contracts are defined in **source TSDoc** and tests ([`AGENTS.md`](../AGENTS.md)).
- [Issue #141 — AI model management](https://github.com/otomatty/zedi/issues/141)
