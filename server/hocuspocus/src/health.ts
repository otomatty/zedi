/**
 * Hocuspocus `/health` エンドポイント用のペイロード組み立てロジック。
 *
 * Issue #889 Phase 5 で全ページが Hocuspocus を経由するようになり、Hocuspocus が
 * Zedi の編集機能の単一障害点になった。Railway のオートヘルスチェックが拾える形で
 * `connections` / `documents` / Postgres プール使用率を集約し、Pg プール枯渇を
 * `degraded` ステータスとして外部から観測できるようにする。
 *
 * 本モジュールは Hocuspocus サーバや `pg.Pool` 本体には依存させず、必要な値だけを
 * 受け取って結果オブジェクトを返す純関数として保つ。これにより以下が成立する:
 *   - 単体テストで状態列挙が網羅できる（プール枯渇・空 Hocuspocus 等）。
 *   - 将来 `/metrics` 形式（Prometheus textfmt 等）への横展開も容易。
 *
 * Pure helpers for the Hocuspocus `/health` endpoint introduced as part of
 * Issue #889 Phase 5. The router caller passes in current counters from the
 * live Hocuspocus instance and the `pg.Pool` so that this module stays free of
 * runtime dependencies — making the saturation logic exhaustively testable
 * (empty pool, saturated pool, callers waiting, etc.).
 */

/**
 * `pg.Pool` から拾うフィールドの最小サブセット。実 `Pool` を import せずに使えるよう
 * 型を直接定義しておく。`max` はコンストラクタオプションから別途渡す。
 *
 * Minimal slice of `pg.Pool`'s observable counters. We avoid pulling in `pg`'s
 * type so this module is unit-testable in isolation. `max` is provided
 * separately because `pg.Pool` does not expose it as a public property.
 */
export interface PgPoolStats {
  /** 現在プールに保持されているクライアント数 / Total clients currently in the pool. */
  totalCount: number;
  /** アイドル状態のクライアント数 / Idle clients available for checkout. */
  idleCount: number;
  /** プール解放待ちで滞留している呼び出し数。0 でなければ枯渇のサイン。
   *  Callers currently waiting for an idle client; non-zero indicates pressure. */
  waitingCount: number;
}

/** `/health` JSON のステータス区分 / Status discriminator for the `/health` payload. */
export type HealthStatus = "healthy" | "degraded";

/**
 * Postgres プールの状態を `/health` 用に正規化したオブジェクト。
 * `active` は呼び出し中（acquired-but-not-idle）の概算。
 *
 * Normalized snapshot of the Postgres pool exposed by `/health`.
 * `active` is approximated as `totalCount - idleCount`.
 */
export interface PgPoolHealth {
  total: number;
  idle: number;
  /** total - idle 相当。プール上限に対するアクティブ比率の分子。
   *  Approx active clients (`total - idle`); numerator for saturation. */
  active: number;
  /** プール解放待ちの呼び出し数。1 以上なら飽和。Waiters; >=1 means saturation. */
  waiting: number;
  /** プールサイズ上限。pg.Pool コンストラクタの `max` と一致させる。 Pool's `max`. */
  max: number;
  /**
   * 飽和度 (0.0 - 1.0)。`active / max`。`max=0` の場合は 0 として返す。
   * Saturation ratio (`active / max`); 0 when `max <= 0`.
   */
  saturation: number;
  /**
   * `true` のとき `/health` 全体を `degraded` に倒す根拠になる（waiters > 0 か飽和度
   * が閾値以上）。具体的な閾値は `evaluateHealth` の実装を参照。
   *
   * When `true`, the pool is the root cause of a `degraded` overall status —
   * either a non-zero waiting queue or saturation at/over the threshold.
   */
  saturated: boolean;
}

/** `evaluateHealth` の入力 / Inputs to {@link evaluateHealth}. */
export interface HealthInputs {
  /** Hocuspocus が現在開いている WebSocket 接続数。From `hocuspocus.getConnectionsCount()`. */
  connections: number;
  /** Hocuspocus がメモリに常駐させている Y.Doc 数。From `hocuspocus.getDocumentsCount()`. */
  documents: number;
  /** Postgres プールのカウンタ。From `pg.Pool` の public フィールド。 */
  pool: PgPoolStats;
  /** Pool の `max` 設定値。`pg.Pool` は公開していないので呼び出し側で渡す。
   *  `max` from the `pg.Pool` constructor; not exposed by `pg`, so passed in. */
  poolMax: number;
  /**
   * `evaluateHealth` がレスポンスに刻む現在時刻。テストで固定したいので関数引数として
   * 受け取る。省略時はモジュール内で `new Date().toISOString()` を呼ぶ。
   *
   * ISO timestamp stamped onto the response. Injected for deterministic tests;
   * defaults to `new Date().toISOString()` when omitted.
   */
  now?: string;
}

/** `/health` レスポンスの最終形。GET /health の JSON ボディそのもの。
 *  Shape returned to HTTP callers; serialized as the `/health` JSON body. */
export interface HealthPayload {
  status: HealthStatus;
  service: "zedi-hocuspocus";
  timestamp: string;
  connections: number;
  documents: number;
  pool: PgPoolHealth;
}

/**
 * Postgres プールの飽和判定で使う閾値（0..1）。`active / max` がこれ以上で飽和扱い。
 *
 * 80% にしているのは、`pg.Pool` の `max=10`（`server/hocuspocus/src/index.ts:59`）
 * 前提で `active >= 8` を「予備が 2 接続しか残っていない」と読むため。waiters が
 * 出る前段（飽和が現実化する直前）で degraded を出してアラート余地を残す。
 *
 * Saturation threshold (active/max). 80% leaves a 2-slot headroom on the
 * default `max=10` pool so `degraded` fires before the queue starts growing.
 */
export const POOL_SATURATION_THRESHOLD = 0.8;

/**
 * `/health` のスナップショットを組み立てる。プール飽和や `waiting > 0` を検知すると
 * `status: "degraded"` を返し、エンドポイント側は引き続き HTTP 200 を返す（Railway の
 * ヘルスチェックでは healthy 扱いになるが、外部監視・ログ側で `status` を見て pager を
 * 飛ばす想定）。Pg プールが完全に空 (totalCount=0) の起動直後は飽和とは見なさない。
 *
 * Build the `/health` payload. Flags `status: "degraded"` when the Postgres
 * pool is saturated or has callers waiting; HTTP status remains 200 so Railway
 * keeps the container in rotation, but external monitors (Better Uptime,
 * Grafana, etc.) page on `status !== "healthy"`. A cold pool with
 * `totalCount=0` is never considered saturated.
 */
export function evaluateHealth(inputs: HealthInputs): HealthPayload {
  const { connections, documents, pool, poolMax, now } = inputs;
  const total = Math.max(0, pool.totalCount | 0);
  const idle = Math.max(0, pool.idleCount | 0);
  const waiting = Math.max(0, pool.waitingCount | 0);
  const max = Math.max(0, poolMax | 0);

  // `idle` が `total` を超える異常値はクランプして 0..total に収める。
  // Clamp `idle` to the legal `0..total` window to absorb out-of-range inputs.
  const idleClamped = Math.min(idle, total);
  const active = total - idleClamped;
  const saturation = max > 0 ? active / max : 0;
  const saturated = waiting > 0 || (total > 0 && saturation >= POOL_SATURATION_THRESHOLD);

  return {
    status: saturated ? "degraded" : "healthy",
    service: "zedi-hocuspocus",
    timestamp: now ?? new Date().toISOString(),
    connections: Math.max(0, connections | 0),
    documents: Math.max(0, documents | 0),
    pool: {
      total,
      idle: idleClamped,
      active,
      waiting,
      max,
      saturation,
      saturated,
    },
  };
}
