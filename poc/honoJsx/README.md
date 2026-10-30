> **Language:** English | [日本語](README.ja.md)

# PoC: Zedi on hono/jsx/dom + Better Auth + D1

This PoC checks three things for a from-scratch rebuild of Zedi. Compatibility with existing data is out of scope.

- Can the whole stack, front end included, be built **with Hono only**?
- Does an all-Cloudflare setup hold up with auth (Better Auth) and D1 in place?
- Do heavy screens stay fast?

## Architecture

One Cloudflare Worker serves everything (`wrangler.jsonc`). The front end and the API share an origin, so no CORS setup or third-party cookies are needed.

| Path                     | Content                                                                    | Technology                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Public page (no JS)                                                        | Server-rendered with `hono/jsx` on the Worker (`src/worker/landing.tsx`)                                                                                       |
| `/api/auth/*`            | Authentication                                                             | Better Auth (`better-auth/minimal` + Drizzle adapter + D1). Magic-link sign-in; Google is enabled only when credentials are set                                |
| `/api/*`                 | Page list/create/detail, note members, full-text search, mock AI streaming | Hono (`src/worker/app.tsx`) + D1. Every route requires a session, with per-note authorization                                                                  |
| `/parties/page-room/:id` | Collaborative editing                                                      | One Durable Object per page (`PageRoom`). Session and page access are checked on connect, viewers cannot write, and saves project the document text back to D1 |
| everything else          | The app SPA                                                                | `hono/jsx/dom` (`src/client/`), served as Static Assets                                                                                                        |

### D1 schema (`migrations/0001_init.sql`)

- **Better Auth tables**: `user` / `session` / `account` / `verification`
- **App tables**: `notes` (the sharing boundary), `note_members`, `pages`, `dev_outbox` (development only; stores magic links instead of emailing them)
- **Listing**: keyset pagination on the `pages_note_recent (note_id, updated_at DESC, id DESC)` index; no `OFFSET`
- **Counts**: `notes.page_count` is maintained by triggers, so no `COUNT(*)` scans
- **Full-text search**: FTS5 with the `trigram` tokenizer, which searches Japanese without a morphological analyzer. It is external-content (no copy of the text) and kept in sync by triggers. It references `pages.seq` (an INTEGER PRIMARY KEY), which unlike an implicit rowid does not change on VACUUM
- **Short terms**: trigram cannot match terms under 3 characters, so those terms alone are filtered with escaped `LIKE`

The Drizzle schema (`src/worker/db/schema.ts`) is kept paired with the SQL; FTS5 and the triggers exist only in SQL.

### Client

Every library the client uses is framework-agnostic:

- `@tanstack/query-core` (regular and cursor-based infinite queries) and `@tanstack/virtual-core`, each wrapped in a thin hook
- `@floating-ui/dom`
- Tiptap 3 core (no React binding) + Y.js + `y-partyserver/provider`

`better-auth/client` is loaded lazily, only for sign-in and sign-out. The router, lazy loading and the command palette (native `<dialog>` + ARIA combobox/listbox) are written in-house; no UI library is used.

## Implemented features

- Magic-link sign-in and sign-out, plus a default note created on first sign-in (a Better Auth database hook)
- Page list from D1 (100 rows per request + virtual scrolling) and page creation
- `⌘K` full-text search across every note the user can access
- Collaborative editor: WikiLinks (`[[` suggestions come from full-text search), `/` commands, `#tags`, remote carets
- Note sharing (viewer / editor). Without access, both the API and the WebSocket answer 404, so page existence does not leak
- Streaming AI output with three rendering strategies

**Out of scope**: real email delivery (Email Service) and the Google OAuth round trip, real LLM calls, Markdown rendering, i18n, offline (IndexedDB), Tauri.

## Commands

```bash
bun install
cp .dev.vars.example .dev.vars   # local BETTER_AUTH_SECRET
bun run test          # unit tests (Node / happy-dom) + integration tests (workerd with D1 and DOs)
bun run typecheck     # client (hono/jsx/dom) and worker (hono/jsx) are checked separately
bun run build         # build the SPA into dist/client
bun run db:migrate    # apply migrations to the local D1
bun run dev:worker    # wrangler dev (http://127.0.0.1:8787)
bun run smoke         # browser check from sign-in to sign-out on a fresh D1 (needs a build)
bun run bundle:report # bundle sizes -> results/bundle.json
bun run measure       # seed 10,000 pages, measure the API and the browser -> results/measurements.json
```

`smoke` and `measure` use Playwright with Chromium; `CHROMIUM_PATH` can point at an existing Chromium. Each run starts from an empty local D1 (`.wrangler/runs/`).

## Tests

| Kind                                          | Count     | Scope                                       |
| --------------------------------------------- | --------- | ------------------------------------------- |
| Unit (Vitest, Node / happy-dom)               | 71        | See below                                   |
| Integration (Vitest, workerd with D1 and DOs) | 17        | Migrations apply the same SQL as production |
| Browser (`bun run smoke`)                     | 10 checks | See below                                   |

Unit tests cover:

- The router, data and virtualizer adapters, the SSE parser and per-frame appending
- The search planner, cursors, 100-parameter chunking and text extraction from Y.js
- `hono/jsx/dom` components (Testing Library)

Integration tests cover:

- Magic-link sign-in, repeat sign-in and sign-out
- Keyset listing and counts
- Japanese full-text search and short-term partial matching
- Hiding other users' notes (404), viewer and editor permissions
- Bulk seeding
- WebSocket authorization (401 without a session, 404 without access, the owner connects) and viewer updates being ignored
- DO-to-D1 projection, found afterwards by full-text search

Browser checks:

- Sign-in through the UI
- Page creation and connecting to its DO
- Tags, WikiLinks and slash commands
- Finding the projected text with full-text search in the palette
- Loading more rows during infinite scroll
- 404 for an unshared user, then a read-only view once shared
- AI streaming
- Sign-out
- No page errors

## Results (2026-10-30)

Environment: headless Chromium in a container against local workerd / D1 (`wrangler dev`). Network latency is not included. **API latencies are local and do not reflect real D1 (round trips to the primary region or read replicas).** Rows read are reported by D1 itself and do not depend on the environment, so they are the metric to use when comparing query efficiency. "4x" is CDP CPU throttling. Raw data is in `results/`.

### Bundle

|                                                                    | raw      | gzip        | brotli   |
| ------------------------------------------------------------------ | -------- | ----------- | -------- |
| **Initial JS** (shell, router, list, palette, session, data layer) | 90.6 KB  | **29.3 KB** | 26.1 KB  |
| Editor (lazy: Tiptap + ProseMirror + Y.js + provider)              | 541.8 KB | 170.8 KB    | 145.3 KB |
| Auth client (lazy: sign-in / sign-out only)                        | 30.1 KB  | 11.2 KB     | 10.0 KB  |
| AI chat (lazy)                                                     | 3.0 KB   | 1.6 KB      | 1.3 KB   |

For reference, the current React app's initial JS is 4.46 MB raw / 1.31 MB gzip.

### D1 (10,000 pages seeded; totals per request)

| API                                         | D1 rows read            | D1 SQL time p50 | Response p50 / p95 (local) |
| ------------------------------------------- | ----------------------- | --------------- | -------------------------- |
| `/api/me` (session from the cookie cache)   | 1                       | 0 ms            | 9.4 / 12.0 ms              |
| Page detail (incl. access check)            | 2                       | 0 ms            | 7.7 / 9.0 ms               |
| List, first 100                             | 102                     | 0 ms            | 11.0 / 15.6 ms             |
| List, 100 rows after row 5,000 (keyset)     | **103**                 | 0 ms            | 10.6 / 16.8 ms             |
| Full-text search (Japanese, 3+ chars)       | 41                      | 2 ms            | 9.6 / 13.4 ms              |
| Full-text search (English)                  | 41                      | 2 ms            | 10.0 / 14.2 ms             |
| Full-text search (no hit)                   | 0                       | 0 ms            | 7.4 / 11.3 ms              |
| 2-char search (`LIKE`, frequent term)       | 189                     | 0 ms            | 7.5 / 9.5 ms               |
| 2-char search (`LIKE`, no hit = worst case) | **10,004**              | 5 ms            | 13.6 / 17.2 ms             |
| Seeding 10,000 pages (incl. triggers)       | **50,000 rows written** | —               | 475 ms                     |

### Browser (signed in)

| Scenario                                                                  | 1x                     | 4x                     |
| ------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| List first render (first 100 rows from D1)                                | 147 ms                 | 427 ms                 |
| 3 s of scrolling (~370 rows, 4 follow-up fetches)                         | 60.6 fps, 0 long tasks | 57.8 fps, 0 long tasks |
| JS heap                                                                   | 7.4 MB                 | 7.2 MB                 |
| Time until the editor is ready (lazy chunk + authorized WebSocket + sync) | 253 ms                 | 700 ms                 |
| Input latency (empty doc) p50 / p95                                       | 3.7 / 17.1 ms          | 19.5 / 51.6 ms         |
| Input latency (2,000 paragraphs, collaboration on) p50 / p95              | 11.7 / 20.1 ms         | 87.8 / 274 ms          |
| Input latency (2,000 paragraphs, collaboration off) p50 / p95             | 7.9 / 17.7 ms          | 37.3 / 57.5 ms         |
| Propagation between two clients p50 / p95                                 | 32 / 54 ms             | 70 / 138 ms            |
| AI, 10,000 tokens (state / direct / blocks)                               | 59 / 59 / 60 fps       | **24 / 25 / 60 fps**   |

## Findings

### Auth (Better Auth)

1. **Better Auth runs on Workers + D1 as is.** With `better-auth/minimal` (no Kysely) and the Drizzle adapter, the query layer is Drizzle throughout.
2. **Sessions come from the cookie cache (5 min) without reading D1.** `/api/me` read a single row, for the default note.
3. **The WebSocket can be authorized with the session cookie too**, because the front end and the API share an origin. Access is checked on connect, and a header set by the Worker makes viewers read-only. There is no need, as with today's Hocuspocus, for another service to read the `session` table directly or to duplicate the permission logic.

### D1

4. **With keyset pagination, each request reads about 100 rows however far you scroll.** It was 103 rows even past row 5,000; `OFFSET` would read 5,000+ rows there.
5. **The FTS5 trigram index works for Japanese** (41 rows read). **Terms of 2 characters or fewer cannot use the index**, though, and without a hit they read every page in the note (10,004 rows). D1 bills by rows read, so one of these is needed:
   - Restrict 2-char searches to titles or to recent pages
   - Maintain a separate 2-gram index
6. **Writes grow about 5x.** One new page costs about 5 written rows across the row, its index, FTS and the count trigger. The DO projection writes only when the text actually changed (`content_text <> ?`).
7. **D1 has no BEGIN/COMMIT-style transactions.** Multi-step updates are built from triggers, `batch()` and conditional UPDATEs.
8. **A statement can bind at most 100 values.** Seeding splits inserts into 14 rows per statement (7 columns × 14 = 98).

### Tooling gotchas

9. **The integration-test package was renamed** from `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin`. Its bundled workerd can also support an older compatibility date than wrangler, and a date that is too new stops the tests from starting.
10. **Worker TSX uses `hono/jsx` and client TSX uses `hono/jsx/dom`.** Without `tsconfig` in `wrangler.jsonc`, the Worker fails with `React is not defined`.

### Front end (unchanged from the previous PoC)

11. **`hono/jsx/dom` is not the bottleneck in any scenario.**
12. **Large-document latency comes mainly from y-prosemirror.** At 4x with 2,000 paragraphs, p50 was 88 ms with collaboration on and 37 ms with it off.
13. **AI streaming should use the `blocks` strategy (one block per paragraph).** The cost is layout, so switching between re-rendering and direct appends does not fix it.

## Next to verify

- Create a D1 database and deploy the Worker on a real Cloudflare account to measure cross-region latency and the effect of read replicas
- Magic-link delivery through Email Service, and the Google OAuth round trip
- AI chat with Markdown rendering
- Large documents (splitting documents, y-prosemirror's update cost)
