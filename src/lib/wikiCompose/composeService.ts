/**
 * Wiki Compose REST + SSE client (#950).
 *
 * `/api/pages/:pageId/compose-sessions` 系を叩く薄いクライアント。
 * - `createSession` / `getSession` / `cancelSession` は通常の REST 呼び出し。
 * - `runSession` / `resumeSession` は SSE ストリームを返し、呼び出し側がイベント
 *   を pattern match して state を進める。
 *
 * Thin REST + SSE client used by `useWikiComposeSession`. The SSE consumer is
 * built around the wire spec produced by `streamSSE` on the server (each event
 * is `event: <name>\n` + `data: <JSON>\n\n`).
 */
import type {
  ComposeSession,
  ComposeSessionUiProjection,
  ComposeSseEvent,
  ComposeSessionStatus,
} from "./types";
import { WIKI_COMPOSE_GRAPH_ID } from "./types";

const getApiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

/** Common request options that include cross-origin cookies. */
const REST_OPTS: RequestInit = { credentials: "include" };

/** Error thrown when the server returns a non-2xx response. */
export class ComposeApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ComposeApiError";
    this.status = status;
    this.body = body;
  }
}

async function jsonOrThrow<T>(res: Response, hint: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = await res.json().catch(() => null);
  const message =
    (body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : null) ?? `${hint} failed: ${res.status}`;
  throw new ComposeApiError(res.status, message, body);
}

// ── REST ────────────────────────────────────────────────────────────────────

/** Body of `POST /api/pages/:pageId/compose-sessions`. */
export interface CreateSessionInput {
  pageId: string;
  graphId?: string;
  backend?: string;
  metadata?: Record<string, unknown>;
}

/** Create a new compose session row. Defaults to the orchestrator graph. */
export async function createSession(input: CreateSessionInput): Promise<ComposeSession> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(
    `${apiBase}/api/pages/${encodeURIComponent(input.pageId)}/compose-sessions`,
    {
      ...REST_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        graphId: input.graphId ?? WIKI_COMPOSE_GRAPH_ID,
        backend: input.backend,
        metadata: input.metadata,
      }),
    },
  );
  const data = await jsonOrThrow<{ session: ComposeSession }>(res, "createSession");
  return data.session;
}

/**
 * `GET /compose-sessions/:id` の応答（行 + 任意の checkpoint projection）。
 * Response of `GET /compose-sessions/:id` (session row + optional checkpoint projection).
 */
export interface GetComposeSessionResult {
  session: ComposeSession;
  projection: ComposeSessionUiProjection | null;
}

/**
 * Compose セッション行と、再開用 projection を取得する (#950)。
 * Fetch a compose session row and optional UI projection for reload.
 */
export async function getSession(
  pageId: string,
  sessionId: string,
): Promise<GetComposeSessionResult> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(
    `${apiBase}/api/pages/${encodeURIComponent(pageId)}/compose-sessions/${encodeURIComponent(sessionId)}`,
    { ...REST_OPTS, method: "GET" },
  );
  const data = await jsonOrThrow<{
    session: ComposeSession;
    projection?: ComposeSessionUiProjection | null;
  }>(res, "getSession");
  return { session: data.session, projection: data.projection ?? null };
}

/** Cancel a compose session (sets status=cancelled). */
export async function cancelSession(
  pageId: string,
  sessionId: string,
): Promise<ComposeSessionStatus> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(
    `${apiBase}/api/pages/${encodeURIComponent(pageId)}/compose-sessions/${encodeURIComponent(sessionId)}`,
    { ...REST_OPTS, method: "DELETE" },
  );
  const data = await jsonOrThrow<{ status: ComposeSessionStatus }>(res, "cancelSession");
  return data.status;
}

// ── SSE helpers ─────────────────────────────────────────────────────────────

/** Per-event handler (sync or async). */
export type ComposeEventHandler = (event: ComposeSseEvent) => void | Promise<void>;

/**
 * Run a compose session. Resolves when the SSE stream terminates (after a
 * `done` event or when the connection drops). Per-event side effects are
 * delivered to `onEvent`; the consumer is responsible for accumulating any
 * state.
 *
 * @param input.pageId    Target page id.
 * @param input.sessionId Compose session id.
 * @param input.body      `body.input` for the graph (initial input or seed).
 * @param input.onEvent   Per-event handler.
 * @param input.signal    Aborts the underlying `fetch` and SSE stream.
 */
export async function runSession(input: {
  pageId: string;
  sessionId: string;
  body?: unknown;
  onEvent: ComposeEventHandler;
  signal?: AbortSignal;
}): Promise<void> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(
    `${apiBase}/api/pages/${encodeURIComponent(input.pageId)}/compose-sessions/${encodeURIComponent(input.sessionId)}/run`,
    {
      ...REST_OPTS,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ input: input.body ?? {} }),
      signal: input.signal,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : null) ?? `runSession failed: ${res.status}`;
    throw new ComposeApiError(res.status, message, body);
  }
  await consumeSseStream(res, input.onEvent, input.signal);
}

/**
 * Resume a compose session from an interrupt. The `resume` payload shape is
 * graph-specific:
 * - `human_review_brief` — `{ answers, appendToExisting? }`
 * - `human_review_research` — `{ approvedSourceIds, rejectedSourceIds?, note? }`
 * - `human_review_outline` — `{ sections }`
 * - `conflict_resolution` — `{ acknowledged: true, note?: string }`
 *
 * The server returns a JSON body `{ status, output }` on resume completion (no
 * SSE stream). Callers must hydrate UI state from `output` (interrupt payloads
 * in `__interrupt__` or `completion` on the final outline approve). Do not call
 * `runSession` while the row is `interrupted` — use `PATCH /resume` only.
 */
export async function resumeSession(input: {
  pageId: string;
  sessionId: string;
  resume: unknown;
  signal?: AbortSignal;
}): Promise<{ status: ComposeSessionStatus; output: unknown }> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(
    `${apiBase}/api/pages/${encodeURIComponent(input.pageId)}/compose-sessions/${encodeURIComponent(input.sessionId)}/resume`,
    {
      ...REST_OPTS,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: input.resume }),
      signal: input.signal,
    },
  );
  return jsonOrThrow<{ status: ComposeSessionStatus; output: unknown }>(res, "resumeSession");
}

/**
 * Consume an SSE response body, splitting on `\n\n` and dispatching each event.
 * Tolerant to multi-line `data:` payloads and `:`-comments. Errors out of the
 * loop on `signal.aborted`.
 *
 * SSE 仕様 (https://html.spec.whatwg.org/multipage/server-sent-events.html)
 * のシンプルなパーサ。`event:` 行を type、`data:` 行を payload として組み立て、
 * 空行で 1 イベント分を確定する。複数行 `data:` は `\n` 連結。
 */
async function consumeSseStream(
  res: Response,
  onEvent: ComposeEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("SSE stream has no body");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on the SSE record separator (blank line).
    // `\n\n` または `\r\n\r\n` をレコード区切りとして扱う。
    let sep: number;
    while ((sep = findRecordSeparator(buffer)) !== -1) {
      const rawRecord = buffer.slice(0, sep);
      const sepLen = buffer.startsWith("\r\n\r\n", sep) ? 4 : 2;
      buffer = buffer.slice(sep + sepLen);
      const event = parseSseRecord(rawRecord);
      if (event) await onEvent(event);
    }
  }
  // Flush any trailing buffered record (in case the server omits the final blank line).
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.length > 0) {
    const event = parseSseRecord(tail);
    if (event) await onEvent(event);
  }
}

function findRecordSeparator(buf: string): number {
  const a = buf.indexOf("\n\n");
  const b = buf.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseSseRecord(record: string): ComposeSseEvent | null {
  const dataLines: string[] = [];
  for (const rawLine of record.split(/\r?\n/)) {
    const line = rawLine;
    if (line.length === 0 || line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
    // `event:` is informational on the wire (sseMapper already inlines `type`
    // into the JSON payload), so we don't need to read it.
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  try {
    const parsed = JSON.parse(payload);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      return parsed as ComposeSseEvent;
    }
    return null;
  } catch {
    return null;
  }
}
