> **Language:** English | [日本語](README.ja.md)

# Zedi app (rebuild)

Zedi rebuilt on a single Cloudflare Worker: the client (`hono/jsx/dom`), the API (Hono), auth (Better Auth), data (D1) and collaborative editing (Durable Objects) are served together. It targets the web app (PWA) only.

Features of the current app (`src/`, `server/*` and `admin/` at the repository root) are being moved here. Once they are in place, the domains switch to this app and it moves to the repository root. Production holds no data, so there is no data migration. The verification that settled this architecture (measurements and findings) is in [docs/verification.md](docs/verification.md).

## Architecture

One Cloudflare Worker serves everything (`wrangler.jsonc`). The front end and the API share an origin, so no CORS setup or third-party cookies are needed.

| Path                     | Content                                                                                      | Technology                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Public page (no JS)                                                                          | Server-rendered with `hono/jsx` on the Worker (`src/worker/landing.tsx`)                                                                                       |
| `/api/auth/*`            | Authentication                                                                               | Better Auth (`better-auth/minimal` + Drizzle adapter + D1). Magic-link sign-in; Google is enabled only when credentials are set                                |
| `/api/*`                 | Page list/create/detail, note members, full-text search, mock AI streaming (text / Markdown) | Hono (`src/worker/app.tsx`) + D1. Every route requires a session, with per-note authorization                                                                  |
| `/parties/page-room/:id` | Collaborative editing                                                                        | One Durable Object per page (`PageRoom`). Session and page access are checked on connect, viewers cannot write, and saves project the document text back to D1 |
| `/sw.js`                 | Service worker (offline)                                                                     | Built from `src/client/sw/`; see "Offline (PWA)" below                                                                                                         |
| everything else          | The app SPA                                                                                  | `hono/jsx/dom` (`src/client/`), served as Static Assets                                                                                                        |

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
- Tiptap 3 core (no React binding) + Y.js + `y-partyserver/provider` + `y-indexeddb`
- `marked`, used for its lexer only (see below)

`@tiptap/y-tiptap` (the Y.js editor binding) carries a small patch, applied on install through `patchedDependencies` (`patches/`); see "Large documents" in [docs/verification.md](docs/verification.md).

`better-auth/client` is loaded lazily, only for sign-in and sign-out. The router, lazy loading and the command palette (native `<dialog>` + ARIA combobox/listbox) are written in-house; no UI library is used.

Two notable in-house parts:

- **Streaming Markdown** (`src/client/markdown/`)
  - `blockSplitter` splits streamed Markdown only where CommonMark also starts a new block. Fenced code, loose lists and setext headings stay together, so rendering block by block gives the same result as rendering the whole text
  - `renderMarkdown` builds DOM nodes straight from `marked`'s tokens. It never uses `innerHTML`, shows raw HTML as text and drops links with unsafe schemes, so no sanitizer is needed
  - `markdownStream` renders each completed block once and freezes it; only the open tail block is re-rendered on each frame
- **Shared carets** (`src/client/editor/sharedCarets.ts`): same wire format and look as Tiptap's CollaborationCaret, with two changes:
  - The local caret is published only after typing pauses (150 ms)
  - Changes to our own awareness (presence and caret state) never trigger a re-render

### Offline (PWA)

The manifest and icon live in `src/client/public/`. The service worker (`src/client/sw/sw.ts`) is a separate build entry; the build fills in its precache list and cache version (`vite.config.ts`) and fails if `sw.js` would import a shared chunk, so it loads as a classic script.

| Request                                                   | Strategy (`src/client/sw/strategy.ts`)                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/assets/*` (hashed build output)                         | Precached at install, cache first                                                          |
| Page navigations                                          | Network first; offline, the cached app shell (`/` is the SSR page online, the SPA offline) |
| `/api/me`, `/api/notes/:id/pages`, `/api/pages/:id` (GET) | Network first, keeping the last 200 response; a 401 deletes the API cache                  |
| Auth, search, AI, realtime, every write, other origins    | Not handled (straight to the network)                                                      |

On top of that:

- **Page content**: each opened page keeps a Y.js copy in IndexedDB (`y-indexeddb`, `zedi:page:<id>`). It reopens and accepts edits offline, and Y.js merges the edits when the WebSocket reconnects.
- **Creating pages**: always through a persistent outbox (`src/client/lib/outbox.ts`) with a client-generated UUID, online or not. `POST /api/notes/:noteId/pages` accepts the id and is idempotent (201 created, 200 retry, 409 if the id belongs to another note, 400 if malformed). The editor opens at once; a page the server does not know yet is shown as "unsynced", and its room connects once the page exists. The queue is sent at start-up, when the connection returns, and after each creation (a page created while a sync runs goes out in the same run). Refusals a retry cannot fix (400, 403, 404, 409, 410, 413, 422) leave the queue and are shown to the user; 401 (the session expired offline), 408, 425, 429, 5xx and network errors keep the page for the next sync.
- **Queries** run in TanStack Query's `offlineFirst` mode so the service worker can answer them; when search cannot reach the server, `⌘K` matches the titles and previews already on the device.
- **Session**: `/api/me` comes from the cache offline. If nothing is cached, the app says it cannot connect and offers a retry.
- **Sign-out** is disabled offline (it would discard unsynced edits). Once the server confirms the session has ended, it deletes the API cache, every local page copy and the queue of unsent pages; if the server refuses, the user stays signed in and is told so.

### Long content (`src/shared/import/splitDocument.ts`)

Spec for splitting web clips and PDF text into pages, based on the large-document measurements:

- **Unit**: text blocks (paragraphs, headings, list-item paragraphs, …); a block without text counts as one. Editing cost grows with this count.
- **Limit**: up to 1,000 blocks a document stays on one page. Above it the editor shows a warning (`src/client/editor/pageSize.ts`, recounted 1 s after edits pause).
- **Where to cut**: before the highest heading level the document uses; a section still over 800 blocks is cut again one heading level deeper. Consecutive sections of the same chapter are packed up to 800 blocks (never across a higher-level heading). Text without headings is cut into even pages. Top-level blocks are never broken up; a block larger than a page gets a page of its own.
- **Pages**: an index page (the original title) lists every part; parts are titled `Title (2/5): first heading`, start with a link back to the index and end with links to the previous and next part. Ids are generated on the client, the same as for offline creation.

## Implemented features

- Magic-link sign-in and sign-out, plus a default note created on first sign-in (a Better Auth database hook)
- Page list from D1 (100 rows per request + virtual scrolling) and page creation
- `⌘K` full-text search across every note the user can access
- Collaborative editor: WikiLinks (`[[` suggestions come from full-text search), `/` commands, `#tags`, remote carets
- Note sharing (viewer / editor). Without access, both the API and the WebSocket answer 404, so page existence does not leak
- Streaming AI output: three strategies for plain text and two for Markdown (`md-blocks` / `md-naive`)
- Offline use as a PWA: cached lists and visited pages, editing and creating pages offline, sync on reconnect
- A long-page warning in the editor and a splitter for long imported content (the import UI itself is not built)

**Not yet built**: most features of the current app (real LLM calls, AI drafting, web clipping, billing, the admin console, MCP and so on), real e-mail delivery (Email Service) and the Google OAuth round trip, code syntax highlighting, i18n.

## Commands

```bash
bun install
cp .dev.vars.example .dev.vars   # local BETTER_AUTH_SECRET and ENVIRONMENT=development
bun run test          # unit tests (Node / happy-dom) + integration tests (workerd with D1 and DOs)
bun run typecheck     # client (hono/jsx/dom), worker (hono/jsx) and Node-run tests are checked separately
bun run build         # build the SPA into dist/client
bun run db:migrate    # apply migrations to the local D1
bun run dev:worker    # wrangler dev (http://127.0.0.1:8787)
bun run smoke         # browser check from sign-in to sign-out on a fresh D1 (needs a build)
bun run bundle:report # bundle sizes -> results/bundle.json
bun run measure       # seed 10,000 pages, measure the API and the browser -> results/measurements.json
# Large-document analysis at 4x CPU throttling -> results/large-documents.json
ONLY=largeDoc CPU_RATES=4 OUTPUT=results/large-documents.json bun run measure
# CPU profile while typing (build without minification first)
bunx vite build --minify false && node scripts/profileTyping.mjs
# Before/after the y-tiptap patch: build once with the patch reverted and once with it, and
# run each bundle in turn with its own OUTPUT (N = run number) so no run overwrites another.
# Then copy each run's `largeDocPatch` into `runs.orig` / `runs.patched` of
# results/y-tiptap-patch.json and recompute `medianP50` from them.
ONLY=largeDocPatch CPU_RATES=4 SEED_PAGES=10 OUTPUT=results/raw/patch-orig-N.json bun run measure
ONLY=largeDocPatch CPU_RATES=4 SEED_PAGES=10 OUTPUT=results/raw/patch-on-N.json bun run measure
```

`smoke` and `measure` use Playwright with Chromium; `CHROMIUM_PATH` can point at an existing Chromium. Each run starts from an empty local D1 (`.wrangler/runs/`).

For investigation, the editor URL accepts these switches:

- `?caret=tiptap`: Tiptap's caret sharing
- `?caret=0`: no caret sharing
- `?collab=0`: no Y.js
- `?cv=1`: `content-visibility`

## Tests

| Kind                                          | Count     | Scope                                       |
| --------------------------------------------- | --------- | ------------------------------------------- |
| Unit (Vitest, Node / happy-dom)               | 164       | See below                                   |
| Integration (Vitest, workerd with D1 and DOs) | 20        | Migrations apply the same SQL as production |
| Browser (`bun run smoke`)                     | 18 checks | See below                                   |

Unit tests cover:

- The router (malformed percent-encoding does not stop it), data and virtualizer adapters, the SSE parser and per-frame appending
- Lazy page loading (an error with a retry when the import fails)
- The search planner, cursors, 100-parameter chunking and text extraction from Y.js
- Markdown
  - Block splitting: equivalence with a full render, and the same result even when streamed one character at a time
  - Renderer safety: raw HTML, `javascript:` links, `//host` and `/\host` links
  - Freezing completed blocks
- Caret publish scheduling
- Collaborative selection with the patched binding: the caret stays on the same characters after remote edits and after an editor change shares a transaction with a direct Yjs edit, undo/redo restore the caret, and typing within one undo step converts no selection
- Splitting long content (heading levels, packing, even cuts, lists kept whole, index and links) and the long-page count
- Offline: service-worker routing and network-first responses (failed cache writes, no-store, 401), the outbox (persistence, order, which refusals are permanent, overlapping flushes, pages added mid-flush, clearing), local search, the session's unavailable state, sign-out (device data cleared only after the server confirms), refreshed search results after a sync
- `hono/jsx/dom` components (Testing Library): the command palette, the search palette (starts empty when reopened), the list (a failed later page and its retry), the editor (viewers stay read-only with `?collab=0`)
- Config: the deployable `wrangler.jsonc` never turns development mode on

Integration tests cover:

- Magic-link sign-in, repeat sign-in and sign-out
- Keyset listing and counts
- Japanese full-text search and short-term partial matching
- Hiding other users' notes (404), viewer and editor permissions
- Bulk seeding
- Creating a page under a client id exactly once (retry returns 200), and refusing a malformed id or one used in another note
- WebSocket authorization (401 without a session, 404 without access, the owner connects) and viewer updates being ignored
- DO-to-D1 projection, found afterwards by full-text search
- A `null` JSON body answering 400, not 500

Browser checks:

- Sign-in through the UI
- Page creation and connecting to its DO
- Tags, WikiLinks and slash commands
- The other tab shows a remote caret
- Finding the projected text with full-text search in the palette
- Loading more rows during infinite scroll
- At 375px wide, the list and the editor get most of the screen width
- 404 for an unshared user, then a read-only view once shared
- AI streaming (plain text, and Markdown headings, lists, code, tables and quotes)
- The service worker takes control; offline, the list and a visited page reopen, sign-out is disabled
- Offline, a new page can be written, is listed as unsynced and is found by local search
- Back online, the page is created and its text is visible from a fresh browser with no local copy
- Sign-out, which also removes cached API data and local page copies
- No page errors
