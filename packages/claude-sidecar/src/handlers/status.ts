/**
 * Tracks active query ids for status reporting.
 * ステータス報告用にアクティブなクエリ ID を追跡する。
 */

/** Tracks in-flight query ids for `status` RPC. / `status` RPC 用の実行中クエリ ID */
export class QueryActivityTracker {
  private readonly active = new Set<string>();

  /** Marks a query as running. / クエリ開始 */
  start(id: string): void {
    this.active.add(id);
  }

  /** Marks a query as finished. / クエリ終了 */
  end(id: string): void {
    this.active.delete(id);
  }

  /** Clears all tracked ids without aborting controllers (e.g. shutdown). / コントローラは中断せず追跡 ID のみクリア */
  clearAll(): void {
    this.active.clear();
  }

  /** Current activity for sidecar status responses. / ステータス応答用スナップショット */
  snapshot(): { status: "idle" | "processing"; activeQueryIds: string[] } {
    const ids = [...this.active];
    return {
      status: ids.length > 0 ? "processing" : "idle",
      activeQueryIds: ids,
    };
  }
}
