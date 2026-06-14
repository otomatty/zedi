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

Output is `admin/dist`. Deployments:

| Environment | URL                       | Cloudflare Pages | Workflow          |
| ----------- | ------------------------- | ---------------- | ----------------- |
| Production  | `admin.zedi-note.app`     | `zedi-admin`     | `deploy-prod.yml` |
| Development | `admin-dev.zedi-note.app` | `zedi-admin-dev` | `deploy-dev.yml`  |

Both are managed by Terraform (`terraform/cloudflare/prod` and `terraform/cloudflare/dev`).

## Environment variables

- **Development (local):** Set `ZEDI_API_PROXY_TARGET=http://localhost:3000` in `.env` to proxy `/api` to that API.
- **Production:** GitHub Actions production environment passes `VITE_API_BASE_URL`, `VITE_MAIN_APP_URL`, and `VITE_ENV_LABEL=production` at build time.
- **Development (deployed):** GitHub Actions development environment passes `VITE_API_BASE_URL` (dev API), `VITE_MAIN_APP_URL` (`https://dev.zedi-note.app`), and `VITE_ENV_LABEL=development`. The sidebar shows a **Development** badge to prevent mistaken operations against prod.

After the first dev admin deploy, update Railway **api-dev** `CORS_ORIGIN` to include `https://admin-dev.zedi-note.app` and set `ADMIN_BASE_URL=https://admin-dev.zedi-note.app`. Add GitHub **development** variable `MAIN_APP_URL=https://dev.zedi-note.app` if not already set.

## Specification

- Behavior and contracts are defined in **source TSDoc** and tests ([`SPECIFICATION_POLICY.md`](../SPECIFICATION_POLICY.md)).
- [Issue #141 — AI model management](https://github.com/otomatty/zedi/issues/141)
