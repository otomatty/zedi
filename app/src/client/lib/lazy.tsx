import { useEffect, useState, type FC } from "hono/jsx/dom";

/**
 * Route-level code splitting: loads a page module on first render and caches it. If the import
 * fails (a stale chunk after a deploy, a network error), the page shows an error with a retry
 * and the next attempt imports again.
 * ルート単位のコード分割。初回描画時にページモジュールを読み込み、以後はキャッシュする。
 * 読み込みに失敗したらエラーと再試行を表示し、再試行で読み込み直す。
 */
export function lazyPage<P extends object>(loader: () => Promise<{ default: FC<P> }>): FC<P> {
  let loaded: FC<P> | null = null;
  let pending: Promise<FC<P>> | null = null;
  const load = () =>
    (pending ??= loader().then(
      (m) => (loaded = m.default),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    ));

  return (props: P) => {
    const [Component, setComponent] = useState<FC<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Component) return;
      let active = true;
      load().then(
        (c) => active && setComponent(() => c),
        () => active && setFailed(true),
      );
      return () => {
        active = false;
      };
    }, [Component, attempt]);

    if (Component) return <Component {...props} />;
    if (failed) {
      return (
        <div role="alert">
          <p>画面を読み込めませんでした。</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return <p class="muted">読み込み中…</p>;
  };
}
