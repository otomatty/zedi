import { createFrameBatcher } from "../lib/frameBatcher";
import { createBlockSplitter } from "./blockSplitter";
import { renderMarkdown } from "./renderMarkdown";

/**
 * Streams Markdown into `container` at most once per frame. Completed blocks are rendered
 * once into their own element and never touched again; only the open tail block is
 * re-parsed and re-rendered, so per-frame cost stays flat as the answer grows.
 * Markdown をフレーム単位で描画する。確定ブロックは一度だけ描画して固定し、
 * 未確定の末尾ブロックだけを毎フレーム描き直すので、応答が長くなってもコストが増えない。
 */
export function createMarkdownStream(
  container: HTMLElement,
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): { append(text: string): void; finish(): void } {
  const doc = container.ownerDocument;
  const splitter = createBlockSplitter();
  const live = doc.createElement("div");
  live.className = "md-block md-live";
  container.append(live);

  const freeze = (block: string) => {
    const el = doc.createElement("div");
    el.className = "md-block";
    el.append(renderMarkdown(block, doc));
    container.insertBefore(el, live);
  };
  const batcher = createFrameBatcher(
    (chunk) => {
      splitter.push(chunk).forEach(freeze);
      live.replaceChildren(renderMarkdown(splitter.tail(), doc));
    },
    schedule,
    cancel,
  );

  return {
    append: (text) => batcher.push(text),
    finish() {
      batcher.flushNow();
      batcher.dispose();
      splitter.finish().forEach(freeze);
      live.remove();
    },
  };
}

/**
 * Baseline for comparison: re-parses and re-renders the whole answer every frame
 * (what a component that re-renders the full Markdown on each update does).
 * 比較用: 毎フレーム全文を解析・描画し直す（全文を再描画するコンポーネントと同じ方式）。
 */
export function createNaiveMarkdownStream(
  container: HTMLElement,
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): { append(text: string): void; finish(): void } {
  let text = "";
  const batcher = createFrameBatcher(
    (chunk) => {
      text += chunk;
      container.replaceChildren(renderMarkdown(text, container.ownerDocument));
    },
    schedule,
    cancel,
  );
  return {
    append: (chunk) => batcher.push(chunk),
    finish() {
      batcher.flushNow();
      batcher.dispose();
    },
  };
}
