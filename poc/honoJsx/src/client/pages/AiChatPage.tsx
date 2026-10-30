import { useEffect, useRef, useState } from "hono/jsx/dom";
import { createFrameBatcher } from "../lib/frameBatcher";
import { createSseParser } from "../lib/sseParser";

type Strategy = "direct" | "blocks" | "state";

const STRATEGIES: readonly Strategy[] = ["direct", "blocks", "state"];

async function streamTokens(
  url: string,
  onToken: (t: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.body) throw new Error("no stream body");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let done = false;
  const parser = createSseParser((e) => {
    if (e.event === "done") done = true;
    else onToken((JSON.parse(e.data) as { t: string }).t);
  });
  while (!done) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    parser.feed(value);
  }
}

/**
 * Appends streamed text paragraph by paragraph: finished paragraphs become separate blocks,
 * so each frame only re-lays out the last block instead of the whole answer.
 * 段落ごとにブロックを分けて追記し、毎フレームのレイアウト対象を最後の段落だけにする。
 */
function createBlockAppender(container: HTMLElement): (chunk: string) => void {
  let current = document.createTextNode("");
  const startBlock = () => {
    const block = document.createElement("div");
    current = document.createTextNode("");
    block.append(current);
    container.append(block);
  };
  startBlock();
  return (chunk) => {
    const parts = chunk.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) startBlock();
      if (part) current.appendData(part);
    });
  };
}

/**
 * Streams a mock AI answer with three rendering strategies to compare their cost:
 * `state` re-renders per token, `direct` appends to one Text node per frame, and `blocks`
 * appends per frame into paragraph blocks.
 * 疑似 AI 応答のストリーミング表示。`state`（トークンごとに再描画）・`direct`（1 つの
 * Text ノードへフレームごとに追記）・`blocks`（段落ブロックへ追記）を比較する。
 */
export default function AiChatPage() {
  const params = new URLSearchParams(location.search);
  const requested = params.get("strategy") as Strategy | null;
  const [strategy, setStrategy] = useState<Strategy>(
    requested && STRATEGIES.includes(requested) ? requested : "direct",
  );
  const [tokens, setTokens] = useState(Number(params.get("tokens") ?? 2000));
  const [interval, setIntervalMs] = useState(Number(params.get("interval") ?? 5));
  const [running, setRunning] = useState(false);
  const [stateText, setStateText] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStateText("");
    window.__zediPoc = { ...window.__zediPoc, aiDone: false, aiTokens: 0 };
    const out = outputRef.current;
    const textNode = document.createTextNode("");
    out?.replaceChildren(strategy === "direct" ? textNode : "");
    const append =
      strategy === "blocks" && out
        ? createBlockAppender(out)
        : (chunk: string) => textNode.appendData(chunk);
    const batcher = createFrameBatcher(append);
    let count = 0;
    performance.mark("ai:start");
    try {
      await streamTokens(
        `/api/ai/chat?tokens=${tokens}&interval=${interval}`,
        (t) => {
          count += 1;
          if (strategy === "state") setStateText((prev) => prev + t);
          else batcher.push(t);
        },
        controller.signal,
      );
      batcher.flushNow();
    } finally {
      batcher.dispose();
      performance.mark("ai:end");
      window.__zediPoc = { ...window.__zediPoc, aiDone: true, aiTokens: count };
      setRunning(false);
    }
  };

  return (
    <section class="ai-page">
      <h1>AI チャット（ストリーミング描画）</h1>
      <form
        class="ai-controls"
        onSubmit={(e: Event) => {
          e.preventDefault();
          void start();
        }}
      >
        <label>
          方式
          <select
            value={strategy}
            onChange={(e: Event) => setStrategy((e.target as HTMLSelectElement).value as Strategy)}
          >
            <option value="direct">direct（フレームごとに追記）</option>
            <option value="blocks">blocks（段落ブロックへ追記）</option>
            <option value="state">state（トークンごとに再描画）</option>
          </select>
        </label>
        <label>
          トークン数
          <input
            type="number"
            min={1}
            value={tokens}
            onInput={(e: Event) => setTokens(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label>
          間隔(ms)
          <input
            type="number"
            min={0}
            value={interval}
            onInput={(e: Event) => setIntervalMs(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <button type="submit" disabled={running} data-testid="ai-start">
          {running ? "受信中…" : "送信"}
        </button>
      </form>
      {strategy === "state" ? (
        <pre class="ai-output" data-testid="ai-output">
          {stateText}
        </pre>
      ) : (
        <pre ref={outputRef} class="ai-output" data-testid="ai-output" />
      )}
    </section>
  );
}
