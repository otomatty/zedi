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

After starting the backend (`docker-compose -f docker-compose.dev.yml up --build`), start the admin app and verify:

- [ ] Admin UI loads at `http://localhost:30001`
- [ ] After login (Google/GitHub), admin users see the AI model list
- [ ] Non-admin users see an "insufficient permissions" message
- [ ] Model toggle, tier change, and sync work

## Build

```bash
cd admin && npm install && npm run build
```

Output is `admin/dist`. Production deploys to Cloudflare Pages project `zedi-admin` via GitHub Actions `deploy-prod.yml` (managed by Terraform).

## Environment variables

- **Development:** Set `ZEDI_API_PROXY_TARGET=http://localhost:3000` in `.env` to proxy `/api` to that API.
- **Production:** GitHub Actions production environment passes `VITE_API_BASE_URL=https://api.zedi-note.app` at build time. `VITE_MAIN_APP_URL` is `https://zedi-note.app`.

## Specification

- Behavior and contracts are defined in **source TSDoc** and tests ([`SPECIFICATION_POLICY.md`](../SPECIFICATION_POLICY.md)).
- [Issue #141 — AI model management](https://github.com/otomatty/zedi/issues/141)
