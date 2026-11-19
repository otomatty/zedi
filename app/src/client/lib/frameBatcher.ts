/**
 * Coalesces many small text pushes (e.g. streamed tokens) into one flush per animation frame,
 * so streaming output touches the DOM at most once per frame.
 * ストリーミングの細かい追記をフレームごとに 1 回へまとめ、DOM 更新を最小にする。
 */
export function createFrameBatcher(
  flush: (text: string) => void,
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancel: (handle: number) => void = cancelAnimationFrame,
): { push(text: string): void; flushNow(): void; dispose(): void } {
  let pending = "";
  let handle: number | null = null;
  let disposed = false;

  const run = () => {
    handle = null;
    if (disposed || pending === "") return;
    const text = pending;
    pending = "";
    flush(text);
  };

  return {
    push(text) {
      if (disposed) return;
      pending += text;
      if (handle === null) handle = schedule(run);
    },
    flushNow() {
      if (handle !== null) cancel(handle);
      run();
    },
    dispose() {
      disposed = true;
      pending = "";
      if (handle !== null) cancel(handle);
      handle = null;
    },
  };
}
