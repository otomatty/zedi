> **Language:** English | [日本語](README.ja.md)

# PoC: Zedi frontend on hono/jsx/dom

This PoC checks two things for a from-scratch rebuild of Zedi: whether the whole stack, front end included, can be built **with Hono only**, and whether heavy screens stay fast. Compatibility with existing data is out of scope.

## Architecture

One Cloudflare Worker serves everything (`wrangler.jsonc`).

| Path                     | Content                                   | Technology                                                                                                       |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`                      | Public page (no JS)                       | Server-rendered with `hono/jsx` on the Worker (`src/worker/landing.tsx`)                                         |
| `/api/*`                 | Note list/detail, mock AI streaming (SSE) | Hono (`src/worker/app.tsx`); 10,000 in-memory fake notes stand in for D1                                         |
| `/parties/page-room/:id` | Collaborative editing                     | One Durable Object per page (`PageRoom`, y-partyserver, WebSocket Hibernation, persisted in the object's SQLite) |
| everything else          | The app SPA                               | `hono/jsx/dom` (`src/client/`), served as Static Assets                                                          |

Every library the client (`src/client/`) uses is framework-agnostic:

- `@tanstack/query-core` and `@tanstack/virtual-core`, each wrapped in a thin hook (`lib/query.ts`, 48 lines; `lib/virtual.ts`, 36 lines)
- `@floating-ui/dom`
- Tiptap 3 core (no React binding) + Y.js + `y-partyserver/provider`

The router (`lib/router.ts`, 115 lines), lazy loading (`lib/lazy.tsx`, 19 lines) and the command palette (`ui/CommandPalette.tsx`, native `<dialog>` + the ARIA combobox/listbox pattern) are written in-house. No UI library is used.

## Implemented features

- Virtualized list of 10,000 notes
- `⌘K` / `Ctrl+K` command palette
- Collaborative editor (lazy chunk)
  - `[[` WikiLink suggestions; the node view is rendered with `hono/jsx/dom`
  - `/` slash commands
  - `#tag` + space creates a tag
  - Remote carets
- Streaming AI output, with three rendering strategies (see below)
- An app shell (sidebar and palette) that stays mounted across navigation

**Out of scope**: auth, D1, real LLM calls, Markdown rendering, i18n, offline (IndexedDB), Tauri.

## Commands

```bash
bun install
bun run test          # Vitest (59 tests; hono/jsx/dom components are tested with happy-dom + Testing Library)
bun run typecheck     # client (hono/jsx/dom) and worker (hono/jsx) are checked separately
bun run build         # build the SPA into dist/client
bun run dev:worker    # wrangler dev (http://127.0.0.1:8787)
bun run smoke         # browser check of the main features (needs a build)
bun run bundle:report # bundle sizes -> results/bundle.json
bun run measure       # runtime measurements -> results/measurements.json
```

`smoke` and `measure` use Playwright with Chromium. If your Playwright version has no matching browser, point `CHROMIUM_PATH` at an existing Chromium.

## Results (2026-10-30)

Environment: headless Chromium in a container against local workerd (`wrangler dev`). Network latency is not included. "4x" is CDP CPU throttling, a rough stand-in for a mid-range mobile device. Raw data is in `results/`.

### Bundle

|                                                           | raw      | gzip        | brotli   |
| --------------------------------------------------------- | -------- | ----------- | -------- |
| **Initial JS** (shell, router, list, palette, data layer) | 85.1 KB  | **27.5 KB** | 24.6 KB  |
| Editor (lazy: Tiptap + ProseMirror + Y.js + provider)     | 541.5 KB | 170.7 KB    | 145.2 KB |
| AI chat (lazy)                                            | 3.0 KB   | 1.6 KB      | 1.4 KB   |

For reference, the current React app's initial JS is 4.46 MB raw / 1.31 MB gzip (measured the same day with `vite build`). The feature scopes differ, so this is not a like-for-like comparison, but the shell and core screens fit in under 30 KB gzip.

### Runtime

| Scenario                                                                  | 1x                     | 4x                     |
| ------------------------------------------------------------------------- | ---------------------- | ---------------------- |
| Note list first render (includes fetching ~2 MB of JSON for 10,000 notes) | 253 ms                 | 632 ms                 |
| List scrolling (19 rows in the DOM)                                       | 58.7 fps, 0 long tasks | 56.9 fps, 0 long tasks |
| JS heap after the list renders                                            | 9.5 MB                 | 9.4 MB                 |
| Time until the editor is ready (lazy chunk + DO sync)                     | 283 ms                 | 929 ms                 |
| Input latency (keydown → next frame, empty doc) p50 / p95                 | 4.6 / 17.9 ms          | 22.4 / 39.1 ms         |
| Input latency (2,000 paragraphs, collaboration on) p50 / p95              | 13.6 / 21.3 ms         | 107 / 184 ms           |
| Input latency (2,000 paragraphs, collaboration off) p50 / p95             | 10.9 / 18.9 ms         | 47.3 / 78.5 ms         |
| Propagation between two clients (local) p50 / p95                         | 33 / 52 ms             | 99 / 292 ms            |
| AI, 2,000 tokens (state / direct / blocks)                                | 60 / 60 / 60 fps       | 45 / 50 / 58 fps       |
| AI, 10,000 tokens (state / direct / blocks)                               | 57 / 57 / 60 fps       | **21 / 24 / 58 fps**   |

AI streaming strategies:

- `state`: updates `useState` and re-renders on every token
- `direct`: appends to a single Text node once per frame
- `blocks`: appends once per frame, starting a new block for each paragraph

## Findings

1. **`hono/jsx/dom` was not the bottleneck in any scenario.** List scrolling held 57 fps even at 4x, and input latency on an empty document was p50 4.6 ms at 1x.
2. **On large documents, input latency comes mainly from the Y.js editor binding (y-prosemirror).** At 4x with 2,000 paragraphs, p50 was 107 ms with collaboration on and 47 ms with it off. Changing the UI framework would not fix this, so it is an editor-design question (document size limits, splitting documents).
3. **AI streaming cost comes from layout, not from the rendering strategy (re-render vs direct append).** Appending to one huge text block drops both `state` and `direct` to 21–24 fps at 4x with 10,000 tokens, with 16 s of long tasks. Splitting paragraphs into separate blocks (`blocks`) keeps 58 fps. The production AI chat should append per paragraph (per Markdown block).
4. **TDD works.** `hono/jsx/dom` components can be tested with Vitest + happy-dom + Testing Library, and logic kept in plain TypeScript can also be covered by mutation testing.
5. **Gotcha**: Worker TSX must use `hono/jsx` (server runtime) while the client uses `hono/jsx/dom`. wrangler (esbuild) only reads `tsconfig.json` automatically, so without `tsconfig` in `wrangler.jsonc` the Worker fails with `React is not defined`.
6. **The in-house foundation totals about 400 lines** (router, data and virtualizer adapters, lazy loading, palette, suggestion popup), all covered by tests.

## Next to verify

- The list and sync with auth (Better Auth) and D1 in place
- AI chat with Markdown rendering (an extension of the `blocks` strategy)
- Large documents (splitting documents, investigating y-prosemirror's update cost)
- A Tauri build that bundles the same SPA
