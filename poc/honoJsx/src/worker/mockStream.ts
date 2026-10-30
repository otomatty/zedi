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

const markdownSection = (n: number) => `## ${n}. 調査結果の要約

Zedi の **ナレッジネットワーク** を Cloudflare に載せた場合の検討です。\`Durable Objects\` を使います。

- ページごとに 1 つの DO
- 共有の単位はノート
  - メンバーは D1 で管理
- [詳細](https://zedi-note.app/notes/${n})

\`\`\`ts
export async function load(id: string) {
  const page = await env.DB.prepare("SELECT * FROM pages WHERE id = ?").bind(id).first();
  return page;
}
\`\`\`

| 項目 | 現行 | 移行後 |
| --- | --- | --- |
| DB | Postgres | D1 |
| リアルタイム | Hocuspocus | DO |

> 注: 数値はローカル計測です。

`;

/**
 * Deterministic tokens (1–4 characters, like LLM tokens) of a Markdown answer with headings,
 * lists, code, tables and quotes.
 * 見出し・リスト・コード・表・引用を含む Markdown 応答を、1〜4 文字のトークンに分けたもの。
 */
export function mockMarkdownTokens(count: number, seed: number): string[] {
  const tokens: string[] = [];
  let section = 1;
  let state = seed;
  while (tokens.length < count) {
    const text = markdownSection(section);
    section += 1;
    for (let i = 0; i < text.length && tokens.length < count; ) {
      state = (state * 1103515245 + 12345) >>> 0;
      const size = 1 + (state % 4);
      tokens.push(text.slice(i, i + size));
      i += size;
    }
  }
  return tokens;
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
