/** Awareness `change` payload from y-protocols. */
export interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

/**
 * Whether an awareness change involves another client. Local-only changes (our own caret)
 * must not trigger a decoration rebuild: that extra transaction per keystroke is expensive
 * in long documents.
 * 他クライアントが関わる変更か。自分のカーソル変更だけで装飾を作り直さないための判定。
 */
export function isRemoteAwarenessChange(change: AwarenessChange, localClientId: number): boolean {
  return [...change.added, ...change.updated, ...change.removed].some((id) => id !== localClientId);
}

/**
 * Trailing debounce with explicit flush/cancel (used to publish the local caret only after
 * typing pauses).
 * 末尾実行のデバウンス（入力が止まってから自分のカーソルを送るために使う）。
 */
export function createTrailingDebounce(fn: () => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    schedule() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, waitMs);
    },
    flush() {
      cancel();
      fn();
    },
    cancel,
  };
}
