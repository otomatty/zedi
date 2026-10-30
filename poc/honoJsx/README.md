> **Language:** English | [日本語](README.ja.md)

# PoC: Zedi on hono/jsx/dom + Better Auth + D1

This PoC checks five things for a from-scratch rebuild of Zedi. Compatibility with existing data is out of scope. The target is the web app only (a PWA); the Tauri desktop app has been dropped from the requirements.

- Can the whole stack, front end included, be built **with Hono only**?
- Does an all-Cloudflare setup hold up with auth (Better Auth) and D1 in place?
- Do heavy screens stay fast (large lists, long collaborative documents, streaming AI output)?
- How should streaming Markdown and editing large documents be designed?
- Can the web app work offline (lists, editing, creating pages) and sync afterwards?

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

`@tiptap/y-tiptap` (the Y.js editor binding) carries a small patch, applied on install through `patchedDependencies` (`patches/`); see "Large documents" in the findings.

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
- **Creating pages**: always through a persistent outbox (`src/client/lib/outbox.ts`) with a client-generated UUID, online or not. `POST /api/notes/:noteId/pages` accepts the id and is idempotent (201 created, 200 retry, 409 if the id belongs to another note, 400 if malformed). The editor opens at once; a page the server does not know yet is shown as "unsynced", and its room connects once the page exists. The queue is sent at start-up, when the connection returns, and after each creation; a refusal (4xx) is shown to the user.
- **Queries** run in TanStack Query's `offlineFirst` mode so the service worker can answer them; when search cannot reach the server, `⌘K` matches the titles and previews already on the device.
- **Session**: `/api/me` comes from the cache offline. If nothing is cached, the app says it cannot connect and offers a retry.
- **Sign-out** is disabled offline (it would discard unsynced edits) and deletes the API cache and every local page copy.

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

**Out of scope**: real email delivery (Email Service) and the Google OAuth round trip (both need external accounts and outbound access), real LLM calls, syntax highlighting, i18n. Tauri is no longer a requirement.

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
# Large-document analysis at 4x CPU throttling -> results/large-documents.json
ONLY=largeDoc CPU_RATES=4 OUTPUT=results/large-documents.json bun run measure
# CPU profile while typing (build without minification first)
bunx vite build --minify false && node scripts/profileTyping.mjs
# Before/after the y-tiptap patch: build once with the patch reverted and once with it,
# then run this for each bundle, alternating -> results/y-tiptap-patch.json
ONLY=largeDocPatch CPU_RATES=4 SEED_PAGES=10 bun run measure
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
| Unit (Vitest, Node / happy-dom)               | 136       | See below                                   |
| Integration (Vitest, workerd with D1 and DOs) | 19        | Migrations apply the same SQL as production |
| Browser (`bun run smoke`)                     | 17 checks | See below                                   |

Unit tests cover:

- The router, data and virtualizer adapters, the SSE parser and per-frame appending
- The search planner, cursors, 100-parameter chunking and text extraction from Y.js
- Markdown
  - Block splitting: equivalence with a full render, and the same result even when streamed one character at a time
  - Renderer safety: raw HTML, `javascript:` links
  - Freezing completed blocks
- Caret publish scheduling
- Collaborative selection with the patched binding: the caret stays on the same characters after remote edits and after an editor change shares a transaction with a direct Yjs edit, undo/redo restore the caret, and typing within one undo step converts no selection
- Splitting long content (heading levels, packing, even cuts, lists kept whole, index and links) and the long-page count
- Offline: service-worker routing, the outbox (persistence, order, retry vs refusal, overlapping flushes), local search, the session's unavailable state, sign-out cleanup of local copies
- `hono/jsx/dom` components (Testing Library)

Integration tests cover:

- Magic-link sign-in, repeat sign-in and sign-out
- Keyset listing and counts
- Japanese full-text search and short-term partial matching
- Hiding other users' notes (404), viewer and editor permissions
- Bulk seeding
- Creating a page under a client id exactly once (retry returns 200), and refusing a malformed id or one used in another note
- WebSocket authorization (401 without a session, 404 without access, the owner connects) and viewer updates being ignored
- DO-to-D1 projection, found afterwards by full-text search

Browser checks:

- Sign-in through the UI
- Page creation and connecting to its DO
- Tags, WikiLinks and slash commands
- The other tab shows a remote caret
- Finding the projected text with full-text search in the palette
- Loading more rows during infinite scroll
- 404 for an unshared user, then a read-only view once shared
- AI streaming (plain text, and Markdown headings, lists, code, tables and quotes)
- The service worker takes control; offline, the list and a visited page reopen, sign-out is disabled
- Offline, a new page can be written, is listed as unsynced and is found by local search
- Back online, the page is created and its text is visible from a fresh browser with no local copy
- Sign-out, which also removes cached API data and local page copies
- No page errors

## Results (2026-10-30)

Environment: headless Chromium in a container against local workerd / D1 (`wrangler dev`). Network latency is not included. "4x" is CDP CPU throttling. Raw data is in `results/`.

- **API latencies are local and do not reflect real D1.** Rows read are reported by D1 itself and do not depend on the environment, so they are the metric to use when comparing query efficiency.
- **The numbers in this README come from this session's VM.** It differs from (and is slower than) the VM behind earlier commits' READMEs, so the two sets are not directly comparable.
- **Input latency at 4x varies 2–3x between runs of the same configuration.** Key comparisons therefore list three runs and are made between configurations within the same run. Every comparison pointed the same way in all three runs.

### Bundle

|                                                                                     | raw      | gzip        | brotli   |
| ----------------------------------------------------------------------------------- | -------- | ----------- | -------- |
| **Initial JS** (shell, router, list, palette, session, data layer, outbox)          | 94.6 KB  | **30.8 KB** | 27.3 KB  |
| Editor (lazy: Tiptap + ProseMirror + Y.js + provider + shared carets + y-indexeddb) | 548.4 KB | 173.2 KB    | 147.2 KB |
| AI chat (lazy: includes `marked` + the Markdown renderer)                           | 53.3 KB  | 16.6 KB     | 15.1 KB  |
| Auth client (lazy: sign-in / sign-out only)                                         | 30.1 KB  | 11.2 KB     | 10.0 KB  |
| Service worker (`/sw.js`, separate from the page)                                   | 1.6 KB   | 0.8 KB      | —        |

Offline support added 1.5 KB gzip to the initial JS and 1.7 KB to the editor.

For reference, the current React app's initial JS is 4.46 MB raw / 1.31 MB gzip.

### D1 (10,000 pages seeded; totals per request)

| API                                         | D1 rows read            | D1 SQL time p50 | Response p50 / p95 (local) |
| ------------------------------------------- | ----------------------- | --------------- | -------------------------- |
| `/api/me` (session from the cookie cache)   | 1                       | 0 ms            | 15.8 / 19.0 ms             |
| Page detail (incl. access check)            | 2                       | 0 ms            | 15.3 / 20.3 ms             |
| List, first 100                             | 102                     | 1 ms            | 23.4 / 34.5 ms             |
| List, 100 rows after row 5,000 (keyset)     | **103**                 | 0 ms            | 22.4 / 30.3 ms             |
| Full-text search (Japanese, 3+ chars)       | 41                      | 4 ms            | 22.1 / 36.1 ms             |
| Full-text search (English)                  | 41                      | 3 ms            | 22.9 / 27.6 ms             |
| Full-text search (no hit)                   | 0                       | 0 ms            | 16.5 / 20.3 ms             |
| 2-char search (`LIKE`, frequent term)       | 189                     | 0 ms            | 15.9 / 24.0 ms             |
| 2-char search (`LIKE`, no hit = worst case) | **10,004**              | 9 ms            | 27.5 / 36.4 ms             |
| Seeding 10,000 pages (incl. triggers)       | **50,000 rows written** | —               | 756 ms                     |

### Browser (signed in)

| Scenario                                                                  | 1x                     | 4x                     |
| ------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| List first render (first 100 rows from D1)                                | 299 ms                 | 692 ms                 |
| 3 s of scrolling (with follow-up fetches)                                 | 59.9 fps, 0 long tasks | 45.5 fps, 2 long tasks |
| JS heap                                                                   | 7.4 MB                 | 4.6 MB                 |
| Time until the editor is ready (lazy chunk + authorized WebSocket + sync) | 492 ms                 | 1,324 ms               |
| Input latency (empty doc) p50 / p95                                       | 6.5 / 18.0 ms          | 30.1 / 124 ms          |
| Propagation between two clients p50 / p95                                 | 34 / 51 ms             | 97 / 187 ms            |

### Streaming AI output

| Strategy                                                           | 1x 2,000 / 10,000 tokens | 4x 2,000 tokens | 4x 10,000 tokens                         |
| ------------------------------------------------------------------ | ------------------------ | --------------- | ---------------------------------------- |
| Text `state` (re-render per token)                                 | 60 / 50 fps              | 33 fps          | 15 fps                                   |
| Text `direct` (append to one Text node)                            | 60 / 50 fps              | 41 fps          | 15 fps                                   |
| Text `blocks` (one block per paragraph)                            | 60 / 60 fps              | 51 fps          | **47 fps**                               |
| Markdown `md-naive` (re-parse and re-render everything each frame) | 60 / 51 fps              | 31–32 fps       | **16–17 fps** (22–24 s of long tasks)    |
| Markdown `md-blocks` (freeze completed blocks)                     | 60 / 60 fps              | 50–54 fps       | **49–53 fps** (0.15–0.3 s of long tasks) |

The 4x Markdown figures are the range over three runs. The current React app's `react-markdown` re-parses the whole message on every update, the same approach as `md-naive`.

### Large documents (4x, input latency p50, three runs)

Typing at the end of a 2,000-paragraph document:

| Configuration                            | Three runs         | Median     |
| ---------------------------------------- | ------------------ | ---------- |
| Tiptap's caret sharing (`?caret=tiptap`) | 467 / 508 / 389 ms | 467 ms     |
| **Lighter shared carets (default)**      | 142 / 215 / 176 ms | **176 ms** |
| No caret sharing (`?caret=0`)            | 255 / 575 / 215 ms | 255 ms     |
| No collaboration (`?collab=0`)           | 65 / 76 / 67 ms    | 67 ms      |

`content-visibility` made things worse in all three runs: Tiptap carets + cv were 415–766 ms, and no collaboration + cv was 111–146 ms. With Tiptap carets, typing at the start of the document took 195–345 ms, lighter than at the end.

By document size (lighter shared carets / no collaboration, p50, three runs):

| Paragraphs | Collaboration on | Collaboration off |
| ---------- | ---------------- | ----------------- |
| 250        | 33–46 ms         | 27–32 ms          |
| 500        | 37–65 ms         | 32–51 ms          |
| 1,000      | 58–102 ms        | 46–56 ms          |
| 2,000      | 151–177 ms       | 68–88 ms          |
| 4,000      | **4.4–4.9 s**    | 227–283 ms        |

The tables above were measured before the y-tiptap patch.

### y-tiptap selection patch (4x, input latency p50)

Typing at the end of the document. Three runs per build, alternating unpatched / patched so that drift on the VM hits both (`results/y-tiptap-patch.json`):

| Configuration                            | Unpatched (three runs)   | Patched (three runs)     | Median                    |
| ---------------------------------------- | ------------------------ | ------------------------ | ------------------------- |
| No caret sharing, 2,000 paragraphs       | 184 / 177 / 139 ms       | 68 / 71 / 87 ms          | 177 → **71 ms**           |
| Lighter shared carets, 2,000 paragraphs  | 148 / 130 / 121 ms       | 90 / 64 / 124 ms         | 130 → **90 ms**           |
| Tiptap's caret sharing, 2,000 paragraphs | 313 / 388 / 422 ms       | 193 / 196 / 300 ms       | 388 → **196 ms**          |
| Lighter shared carets, 4,000 paragraphs  | 2,561 / 4,188 / 3,198 ms | 1,168 / 2,172 / 1,147 ms | 3,198 → **1,168 ms**      |
| No collaboration, 2,000 paragraphs       | 67 / 74 / 60 ms          | 64 / 59 / 62 ms          | 67 → 62 ms (not affected) |

On the final build, which also writes every update to IndexedDB, two runs gave 64–70 ms with shared carets at 2,000 paragraphs and 0.9–1.0 s at 4,000.

## Findings

### Auth (Better Auth)

1. **Better Auth runs on Workers + D1 as is.** With `better-auth/minimal` (no Kysely) and the Drizzle adapter, the query layer is Drizzle throughout.
2. **Sessions come from the cookie cache (5 min) without reading D1.** `/api/me` read a single row, for the default note.
3. **The WebSocket can be authorized with the session cookie too**, because the front end and the API share an origin. There is no need, as with today's Hocuspocus, for another service to read the `session` table directly or to duplicate the permission logic.

### D1

4. **With keyset pagination, each request reads about 100 rows however far you scroll** (103 rows even past row 5,000).
5. **The FTS5 trigram index works for Japanese** (41 rows read). **Terms of 2 characters or fewer cannot use the index**, though, and without a hit they read every page in the note (10,004 rows). D1 bills by rows read, so one of these is needed:
   - Restrict 2-char searches to titles or to recent pages
   - Maintain a separate 2-gram index
6. **Writes grow about 5x** (about 5 rows per page). The DO projection writes only when the text actually changed.
7. **D1 has no BEGIN/COMMIT-style transactions, and a statement can bind at most 100 values.** Multi-step updates are built from triggers, `batch()` and conditional UPDATEs; the idempotent page creation is an `INSERT … ON CONFLICT DO NOTHING` and an owner check in one `batch()`.

### Streaming AI output

8. **The cost comes from "processing the whole answer every time", not from how the framework renders.** For both plain text and Markdown, re-rendering everything degrades as the answer grows, down to 15–17 fps at 4x with 10,000 tokens.
9. **`md-blocks` holds about 50 fps at 4x regardless of length**, because it renders each completed block once and only parses and renders the open tail. The production AI chat should use this approach; the current `react-markdown`-based chat should degrade the same way on long answers.
10. **Building DOM straight from tokens renders Markdown safely without a sanitizer.** The AI chat chunk is 16.6 KB gzip including `marked`'s lexer. Because blocks are split only where CommonMark also splits them, completed blocks never need re-rendering.

### Large documents

11. **Tiptap's caret sharing is the heaviest part in large documents.** On every keystroke it:
    - converts the local caret position by walking the document from the start (cost proportional to position)
    - publishes awareness
    - reacts to its own awareness change with an extra transaction that redraws decorations across the document
12. **Replacing it with the lighter shared carets improved input latency 2.2–3.3x** (median 467 → 176 ms before the binding patch). The wire format matches Tiptap's.
13. **The Y.js binding converted the selection to relative positions three times per keystroke, which local typing does not need.** `@tiptap/y-tiptap` did it before every Yjs transaction, again after applying a local edit, and in its undo plugin on every editor transaction, each time walking the document from the start. The patch in `patches/` (about 60 lines):
    - skips the first for the editor's own transactions
    - defers the second until a nested transaction or a reader needs it (still immediate when an editor change shares an outer transaction with other Yjs edits)
    - does the third only when the change starts a new undo step (if that prediction misses, the step simply restores no caret)

    Remote edits, undo/redo and shared transactions keep the caret where it was (unit tests). `@tiptap/y-tiptap` is a fork of y-prosemirror, so the same change likely applies there; it is worth proposing upstream.

14. **With the patch, collaboration at 2,000 paragraphs costs little over a local editor**: without carets 177 → 71 ms (local editor 62–67 ms), with shared carets 130 → 90 ms, with Tiptap's carets 388 → 196 ms.
15. **4,000 paragraphs still back up (about 1 s p50, down from 3–4 s).** The remaining cost was not profiled this round; the binding still reconciles all top-level children on every change (`updateYFragment`), which grows with the document.
16. **`content-visibility: auto` backfired**, probably because ProseMirror's caret coordinate calculations force the skipped layout to run anyway.
17. **Document-size guideline, now implemented**: the editor warns above 1,000 text blocks, and long imports are split by the rules in "Long content". This also matches Zedi's "one page, one idea" principle.

### Offline (PWA)

18. **A hand-written 1.6 KB service worker is enough; no Workbox needed.** The trap: a module shared with the app becomes a separate chunk that a classic service worker cannot import, so the build checks for it (the app clears caches by name prefix instead of importing the constant).
19. **With Static Assets' SPA fallback, `/index.html` is not the app shell.** The default HTML handling redirects it to `/`, which here is the Worker's SSR page. The service worker caches `/notes` (any SPA route) as the shell instead.
20. **Client-generated ids keep offline creation simple**: one code path online and offline, an idempotent server insert, and the room connects only once the page exists. Y.js handles the content, so there is no conflict logic for page bodies.
21. **TanStack Query pauses queries while the browser reports offline**; `networkMode: "offlineFirst"` lets them run so the service worker can answer from its cache.
22. **The provider only reports a disconnect after it has connected once**, so the editor's offline label also follows `navigator.onLine`.
23. **Offline data stays in the browser in plain form.** Cached API responses and local Y.js copies are deleted on sign-out, and the API cache on any 401. Sign-out is blocked offline so unsynced edits are not silently thrown away. Encryption at rest and storage eviction are not handled.

### Tooling gotchas

24. **The integration-test package was renamed** from `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin`, and its bundled workerd can support an older compatibility date than wrangler.
25. **Worker TSX uses `hono/jsx` and client TSX uses `hono/jsx/dom`.** Without `tsconfig` in `wrangler.jsonc`, the Worker fails with `React is not defined`.
26. **4x CPU throttling on a shared VM is noisy from run to run.** Base performance decisions on comparisons within the same run and on repeated, alternating runs.
27. **lib0 captures `Date.now` when it loads, so fake timers do not move Yjs' undo capture window.** Tests start a new undo step with `UndoManager.stopCapturing()`, which is what a pause in typing does.
28. **Observing calls inside a dependency needs it inlined**: `@tiptap/y-tiptap` and `@tiptap/extension-collaboration` are processed by Vite in unit tests (`server.deps.inline`) so `vi.mock("yjs")` reaches them.

### Front end overall

29. **`hono/jsx/dom` was not the bottleneck in any scenario.** Every slow spot traced back to something else: full re-renders, layout, or the Y.js binding.

## Next to verify

- Deploying on a real Cloudflare account to measure cross-region latency and read replicas (skipped this time, as instructed)
- Magic-link delivery through Email Service, and the Google OAuth round trip (need external accounts and outbound access)
- Proposing the selection patch upstream (`@tiptap/y-tiptap` / y-prosemirror), and profiling what remains at 4,000 paragraphs
- An import flow that uses the splitter: web clip / PDF text → ProseMirror JSON → pages with initial content (needs a way to seed a page's Durable Object)
- Offline: fetching recent pages ahead of time, a page deleted on the server while edited offline, storage persistence (`navigator.storage.persist()`) and quotas, sharing pending pages between tabs
- Deciding, item by item, what to delete or port from the current app's desktop-only features ([docs/tauriRemoval.md](docs/tauriRemoval.md))
