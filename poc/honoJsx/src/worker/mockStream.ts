const WORDS = [
  "Zedi",
  "は",
  "思考",
  "を",
  "ネットワーク",
  "として",
  "広げる",
  "ナレッジ",
  "アプリ",
  "です。",
  "Durable Objects",
  "で",
  "共同編集",
  "を",
  "同期",
  "します。",
  "\n",
  "hono/jsx/dom",
  "の",
  "描画",
  "コスト",
  "を",
  "計測",
  "中。",
];

/**
 * Deterministic pseudo tokens that imitate an LLM response.
 * LLM の応答を模した決定的なトークン列。
 */
export function mockTokens(count: number, seed: number): string[] {
  return Array.from({ length: count }, (_, i) => WORDS[(i * 7 + seed) % WORDS.length] as string);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Encodes tokens as a server-sent event stream, waiting `intervalMs` before each token.
 * トークンを SSE ストリームに変換する（各トークンの前に `intervalMs` 待つ）。
 */
export function createSseStream(
  tokens: readonly string[],
  intervalMs: number,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const token of tokens) {
        if (intervalMs > 0) await sleep(intervalMs);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: token })}\n\n`));
      }
      controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      controller.close();
    },
  });
}
