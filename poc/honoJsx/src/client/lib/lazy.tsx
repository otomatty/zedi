import { useEffect, useState, type FC } from "hono/jsx/dom";

/**
 * Route-level code splitting: loads a page module on first render and caches it.
 * ルート単位のコード分割。初回描画時にページモジュールを読み込み、以後はキャッシュする。
 */
export function lazyPage<P extends object>(loader: () => Promise<{ default: FC<P> }>): FC<P> {
  let loaded: FC<P> | null = null;
  let pending: Promise<FC<P>> | null = null;
  const load = () => (pending ??= loader().then((m) => (loaded = m.default)));

  return (props: P) => {
    const [Component, setComponent] = useState<FC<P> | null>(() => loaded);
    useEffect(() => {
      if (!Component) void load().then((c) => setComponent(() => c));
    }, [Component]);
    return Component ? <Component {...props} /> : <p class="muted">読み込み中…</p>;
  };
}
