/**
 * 外部の AbortSignal と内部の AbortController を結合する。
 * Aborts when either the external signal or the internal controller aborts.
 *
 * @param external - 呼び出し元が渡したシグナル（省略可） / Optional caller signal
 * @param internal - プロバイダが `abort()` で使うコントローラ / Internal controller for `abort()`
 */
export function mergeAbortSignals(
  external: AbortSignal | undefined,
  internal: AbortController,
): AbortSignal {
  if (external === undefined) {
    return internal.signal;
  }
  return AbortSignal.any([external, internal.signal]);
}
