/**
 * 非同期 worker をキー単位でコアレッシングするラッパーを生成する。
 *
 * あるキーの worker が in-flight の間に同じキーで再度呼び出された場合、
 * 新たな worker は起動せず「追走フラグ」だけを立てる。in-flight が完了した
 * 時点でフラグが立っていれば、最新状態を取り込むために worker をもう一度
 * だけ実行する。これにより、1 キーあたり「実行中 1 + 待機 1」を上限として
 * バースト（例: 連続保存ごとのグラフ再構築 HTTP）を間引く。
 *
 * Wraps an async worker so calls are coalesced per key. While a worker for a
 * key is in flight, additional calls for the same key do not spawn another
 * worker — they only set a trailing flag. When the in-flight run settles, a
 * single trailing run is issued if any call arrived meanwhile, so the latest
 * state is still picked up. This caps concurrency at one in-flight + one
 * queued run per key, collapsing bursts (e.g. graph-sync HTTP per save).
 *
 * worker の reject はラッパー内で握りつぶし、以降の実行を阻害しない。
 * Worker rejections are swallowed so they never block later runs.
 */
export function coalescePerKey(
  worker: (key: string) => Promise<void>,
): (key: string) => Promise<void> {
  const inFlight = new Set<string>();
  const pending = new Set<string>();

  async function run(key: string): Promise<void> {
    if (inFlight.has(key)) {
      // 既に実行中: 追走フラグだけ立てて即返す。
      pending.add(key);
      return;
    }

    inFlight.add(key);
    try {
      await worker(key);
    } catch {
      // ベストエフォート: worker 側でログ済み想定。ここでは握りつぶす。
    } finally {
      inFlight.delete(key);
    }

    if (pending.has(key)) {
      pending.delete(key);
      // 最新状態を取り込むためにもう一度だけ実行する。
      await run(key);
    }
  }

  return run;
}
