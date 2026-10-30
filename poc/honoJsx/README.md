> **Language:** English | [日本語](README.ja.md)

# PoC: Zedi on hono/jsx/dom + Better Auth + D1

This PoC checks four things for a from-scratch rebuild of Zedi. Compatibility with existing data is out of scope.

- Can the whole stack, front end included, be built **with Hono only**?
- Does an all-Cloudflare setup hold up with auth (Better Auth) and D1 in place?
- Do heavy screens stay fast (large lists, long collaborative documents, streaming AI output)?
- How should streaming Markdown and editing large documents be designed?

## Architecture

One Cloudflare Worker serves everything (`wrangler.jsonc`). The front end and the API share an origin, so no CORS setup or third-party cookies are needed.

| Path                     | Content                                                                                      | Technology                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Public page (no JS)                                                                          | Server-rendered with `hono/jsx` on the Worker (`src/worker/landing.tsx`)                                                                                       |
| `/api/auth/*`            | Authentication                                                                               | Better Auth (`better-auth/minimal` + Drizzle adapter + D1). Magic-link sign-in; Google is enabled only when credentials are set                                |
| `/api/*`                 | Page list/create/detail, note members, full-text search, mock AI streaming (text / Markdown) | Hono (`src/worker/app.tsx`) + D1. Every route requires a session, with per-note authorization                                                                  |
| `/parties/page-room/:id` | Collaborative editing                                                                        | One Durable Object per page (`PageRoom`). Session and page access are checked on connect, viewers cannot write, and saves project the document text back to D1 |
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
- Tiptap 3 core (no React binding) + Y.js + `y-partyserver/provider`
- `marked`, used for its lexer only (see below)

`better-auth/client` is loaded lazily, only for sign-in and sign-out. The router, lazy loading and the command palette (native `<dialog>` + ARIA combobox/listbox) are written in-house; no UI library is used.

Two notable in-house parts:

- **Streaming Markdown** (`src/client/markdown/`)
  - `blockSplitter` splits streamed Markdown only where CommonMark also starts a new block. Fenced code, loose lists and setext headings stay together, so rendering block by block gives the same result as rendering the whole text
  - `renderMarkdown` builds DOM nodes straight from `marked`'s tokens. It never uses `innerHTML`, shows raw HTML as text and drops links with unsafe schemes, so no sanitizer is needed
  - `markdownStream` renders each completed block once and freezes it; only the open tail block is re-rendered on each frame
- **Shared carets** (`src/client/editor/sharedCarets.ts`): same wire format and look as Tiptap's CollaborationCaret, with two changes:
  - The local caret is published only after typing pauses (150 ms)
  - Changes to our own awareness (presence and caret state) never trigger a re-render

## Implemented features

- Magic-link sign-in and sign-out, plus a default note created on first sign-in (a Better Auth database hook)
- Page list from D1 (100 rows per request + virtual scrolling) and page creation
- `⌘K` full-text search across every note the user can access
- Collaborative editor: WikiLinks (`[[` suggestions come from full-text search), `/` commands, `#tags`, remote carets
- Note sharing (viewer / editor). Without access, both the API and the WebSocket answer 404, so page existence does not leak
- Streaming AI output: three strategies for plain text and two for Markdown (`md-blocks` / `md-naive`)

**Out of scope**: real email delivery (Email Service) and the Google OAuth round trip (both need external accounts and outbound access), real LLM calls, syntax highlighting, i18n, offline (IndexedDB), Tauri.

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
| Unit (Vitest, Node / happy-dom)               | 94        | See below                                   |
| Integration (Vitest, workerd with D1 and DOs) | 17        | Migrations apply the same SQL as production |
| Browser (`bun run smoke`)                     | 12 checks | See below                                   |

Unit tests cover:

- The router, data and virtualizer adapters, the SSE parser and per-frame appending
- The search planner, cursors, 100-parameter chunking and text extraction from Y.js
- Markdown
  - Block splitting: equivalence with a full render, and the same result even when streamed one character at a time
  - Renderer safety: raw HTML, `javascript:` links
  - Freezing completed blocks
- Caret publish scheduling
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
- The other tab shows a remote caret
- Finding the projected text with full-text search in the palette
- Loading more rows during infinite scroll
- 404 for an unshared user, then a read-only view once shared
- AI streaming (plain text, and Markdown headings, lists, code, tables and quotes)
- Sign-out
- No page errors

## Results (2026-10-30)

Environment: headless Chromium in a container against local workerd / D1 (`wrangler dev`). Network latency is not included. "4x" is CDP CPU throttling. Raw data is in `results/`.

- **API latencies are local and do not reflect real D1.** Rows read are reported by D1 itself and do not depend on the environment, so they are the metric to use when comparing query efficiency.
- **The numbers in this README come from this session's VM.** It differs from (and is slower than) the VM behind earlier commits' READMEs, so the two sets are not directly comparable.
- **Input latency at 4x varies 2–3x between runs of the same configuration.** Key comparisons therefore list three runs and are made between configurations within the same run. Every comparison pointed the same way in all three runs.

### Bundle

|                                                                       | raw      | gzip        | brotli   |
| --------------------------------------------------------------------- | -------- | ----------- | -------- |
| **Initial JS** (shell, router, list, palette, session, data layer)    | 90.6 KB  | **29.3 KB** | 26.1 KB  |
| Editor (lazy: Tiptap + ProseMirror + Y.js + provider + shared carets) | 543.9 KB | 171.5 KB    | 145.9 KB |
| AI chat (lazy: includes `marked` + the Markdown renderer)             | 53.2 KB  | 16.6 KB     | 15.0 KB  |
| Auth client (lazy: sign-in / sign-out only)                           | 30.1 KB  | 11.2 KB     | 10.0 KB  |

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
7. **D1 has no BEGIN/COMMIT-style transactions, and a statement can bind at most 100 values.** Multi-step updates are built from triggers, `batch()` and conditional UPDATEs.

### Streaming AI output

8. **The cost comes from "processing the whole answer every time", not from how the framework renders.** For both plain text and Markdown, re-rendering everything degrades as the answer grows, down to 15–17 fps at 4x with 10,000 tokens.
9. **`md-blocks` holds about 50 fps at 4x regardless of length**, because it renders each completed block once and only parses and renders the open tail. The production AI chat should use this approach; the current `react-markdown`-based chat should degrade the same way on long answers.
10. **Building DOM straight from tokens renders Markdown safely without a sanitizer.** The AI chat chunk is 16.6 KB gzip including `marked`'s lexer. Because blocks are split only where CommonMark also splits them, completed blocks never need re-rendering.

### Large documents

11. **Tiptap's caret sharing is the heaviest part in large documents.** On every keystroke it:
    - converts the local caret position by walking the document from the start (cost proportional to position)
    - publishes awareness
    - reacts to its own awareness change with an extra transaction that redraws decorations across the document
12. **Replacing it with the lighter shared carets improved input latency 2.2–3.3x** (median 467 → 176 ms), on par with no caret sharing at all, so the caret cost is essentially gone. The wire format matches Tiptap's.
13. **The remaining gap is the Y.js editor binding (y-prosemirror / `@tiptap/y-tiptap`), and it grows with document size.** It covers change reconciliation and converting the selection to relative positions on every transaction (which local typing does not need). A real fix needs changes in the binding, i.e. an upstream proposal.
14. **`content-visibility: auto` backfired**, probably because ProseMirror's caret coordinate calculations force the skipped layout to run anyway.
15. **Document-size guideline**: up to about 1,000 paragraphs, collaboration costs little over a local editor. At 2,000 it is about 2x, and at 4,000 each keystroke takes longer than the typing interval, so input backs up into multi-second delays. In line with Zedi's "one page, one idea" principle, we recommend:
    - A soft limit (warning) around 1,000 blocks per page
    - Splitting long imports (web clips, PDFs) into several pages

### Tooling gotchas

16. **The integration-test package was renamed** from `@cloudflare/vitest-pool-workers` to `@cloudflare/vitest-plugin`, and its bundled workerd can support an older compatibility date than wrangler.
17. **Worker TSX uses `hono/jsx` and client TSX uses `hono/jsx/dom`.** Without `tsconfig` in `wrangler.jsonc`, the Worker fails with `React is not defined`.
18. **4x CPU throttling on a shared VM is noisy from run to run.** Base performance decisions on comparisons within the same run and on repeated runs.

### Front end overall

19. **`hono/jsx/dom` was not the bottleneck in any scenario.** Every slow spot traced back to something else: full re-renders, layout, or the Y.js binding.

## Next to verify

- Deploying on a real Cloudflare account to measure cross-region latency and read replicas (skipped this time, as instructed)
- Magic-link delivery through Email Service, and the Google OAuth round trip (need external accounts and outbound access)
- Skipping y-prosemirror's selection conversion for local typing (an upstream proposal, or a small patch to measure the gain)
- The spec for splitting long content into pages (web clips, PDF imports)
- A Tauri build and offline (IndexedDB)
