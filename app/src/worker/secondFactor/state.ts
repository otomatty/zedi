/**
 * Where a session stands on the second factor. A session starts unverified after Google
 * sign-in; it may only register or check a second factor, and only for ten minutes.
 * セッションの 2 段階目の状態。Google のサインイン直後は未確認で、10 分だけ登録・確認に使える。
 */

/** How long an unverified session may be used to complete the second step. */
export const UNVERIFIED_SESSION_TTL_MS = 10 * 60_000;

/** `pending`: passed Google only, still within ten minutes; `expired`: past that. */
export type SecondFactorState = "verified" | "pending" | "expired";

/**
 * `secondFactorAt` is a Date when read from D1 and an ISO string when read from the cookie
 * cache; either way only its presence matters here.
 */
export function secondFactorState(
  session: { createdAt: Date; secondFactorAt?: Date | string | null },
  nowMs: number,
): SecondFactorState {
  if (session.secondFactorAt) return "verified";
  return nowMs - session.createdAt.getTime() < UNVERIFIED_SESSION_TTL_MS ? "pending" : "expired";
}
