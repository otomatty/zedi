/**
 * Build a real `Response` for fetch stubs in unit tests.
 * ユニットテストの fetch スタブ用に本物の `Response` を組み立てる。
 *
 * @param body - JSON-serializable body (use `null` to simulate empty error payloads)
 * @param init - Optional HTTP status / ok override
 */
export function jsonResponse(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): Response {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  return new Response(JSON.stringify(body), { status, statusText: ok ? "OK" : "Error" });
}
