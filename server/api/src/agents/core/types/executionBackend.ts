/**
 * Execution backend identifies where the LangGraph agent runs and which
 * credential mode applies.
 *
 * 実行バックエンド。LangGraph エージェントが「どこで・誰の鍵で」走るかを表す。
 *
 * - `zedi_managed` — Zedi がプロビジョニングしたシステム API キーで API
 *   ホスト内で実行する。月次予算・利用記録は `recordUsage` を通る。これが
 *   P0 (#948) で唯一サポートされる backend。
 * - `byok` — ユーザーが自分の API キーを持ち込んで API ホスト内で実行する。
 *   P0 では未対応 (#951 で導入)。
 * - `byo_runner` — ユーザー所有のランナー（将来の self-host 想定）。P0 では
 *   未対応で予約済み。
 *
 * `zedi_managed` is the only backend supported in P0 (#948). `byok` and
 * `byo_runner` are reserved for follow-ups (#951 and later) so the column
 * shape can stabilise before behaviour is wired up.
 */
export type ExecutionBackend = "zedi_managed" | "byok" | "byo_runner";

/**
 * P0 で受け入れる backend のホワイトリスト。
 * Whitelist of backends accepted in P0.
 */
export const SUPPORTED_BACKENDS_P0: ReadonlyArray<ExecutionBackend> = ["zedi_managed"];

/**
 * 与えられた値が `ExecutionBackend` の文字列かどうかを判定する。
 * Type guard for `ExecutionBackend`.
 */
export function isExecutionBackend(value: unknown): value is ExecutionBackend {
  return value === "zedi_managed" || value === "byok" || value === "byo_runner";
}
