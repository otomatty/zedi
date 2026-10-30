> **Language:** English | [日本語](verification.ja.md)

# Rebuild verification results

Record of the verification that settled the app's architecture (hono/jsx/dom, Better Auth, D1 and Durable Objects on one Cloudflare Worker). It ran in `poc/honoJsx/`, which then became the app in `app/`. For the commands mentioned here, see Commands in the [README](../README.md).

## Results (2026-10-30)

Environment: headless Chromium in a container against local workerd / D1 (`wrangler dev`). Network latency is not included. "4x" is CDP CPU throttling. Raw data is in `results/`.

- **API latencies are local and do not reflect real D1.** Rows read are reported by D1 itself and do not depend on the environment, so they are the metric to use when comparing query efficiency.
- **The numbers here come from the verification session's VM.** It differs from (and is slower than) the VM behind earlier commits' READMEs, so the two sets are not directly comparable.
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

Note: during these runs the mock stream (`mockMarkdownTokens`) had a PRNG bug and produced almost only one-character tokens (1–4 was intended). Token (event) counts were right, but the text was shorter than intended. With the fix the same token count yields about 2.5 times the text, which should make `md-naive` (whole text every frame) slower still, so the gap should widen. The runs have not been repeated with the fixed workload.

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
