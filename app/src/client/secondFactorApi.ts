/** Where the session stands on the second factor (`GET /api/second-factor`). */
export interface SecondFactorStatus {
  verified: boolean;
  /** Whether an authenticator app is registered. */
  totp: boolean;
  recoveryCodesRemaining: number;
}

/** Why the server refused a second-factor request. */
export type SecondFactorRefusal =
  | "invalid_code"
  | "too_many_attempts"
  | "unauthorized"
  | "already_enrolled"
  | "not_enrolled"
  | "no_pending_enrollment"
  | "unexpected";

const KNOWN = new Set<string>([
  "invalid_code",
  "too_many_attempts",
  "unauthorized",
  "already_enrolled",
  "not_enrolled",
  "no_pending_enrollment",
]);

/** A refused second-factor request; `retryAfterSeconds` is set for `too_many_attempts`. */
export class SecondFactorError extends Error {
  /** `reason` is the server's error code; `retryAfterSeconds` comes from `Retry-After`. */
  constructor(
    readonly reason: SecondFactorRefusal,
    readonly retryAfterSeconds?: number,
  ) {
    super(reason);
  }
}

async function call<T>(path: string, body?: Record<string, string>): Promise<T> {
  const res = await fetch(
    `/api/second-factor${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (res.ok) return (await res.json()) as T;
  const error = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error;
  const reason = typeof error === "string" && KNOWN.has(error) ? error : "unexpected";
  const retryAfter = Number(res.headers.get("retry-after"));
  throw new SecondFactorError(
    reason as SecondFactorRefusal,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

/**
 * The second-factor endpoints (`/api/second-factor/*`).
 * 2 段階目の API。
 */
export const secondFactorApi = {
  status: () => call<SecondFactorStatus>(""),
  /** The recovery codes come with the secret, before the first code confirms it. */
  startEnrollment: () =>
    call<{ secret: string; uri: string; recoveryCodes: string[] }>("/totp/enrollment", {}),
  confirmEnrollment: (code: string) =>
    call<Record<string, never>>("/totp/enrollment/confirm", { code }),
  verifyTotp: (code: string) => call<Record<string, never>>("/totp/verify", { code }),
  verifyRecoveryCode: (code: string) =>
    call<{ recoveryCodesRemaining: number }>("/recovery-code/verify", { code }),
};

/** The client the second-factor screen uses (swapped for a fake in its tests). */
export type SecondFactorApi = typeof secondFactorApi;
