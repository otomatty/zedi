import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "./lib/webauthn";

/** Where the session stands on the second factor (`GET /api/second-factor`). */
export interface SecondFactorStatus {
  verified: boolean;
  /** Whether an authenticator app is registered. */
  totp: boolean;
  /** How many passkeys are registered. */
  passkeys: number;
  recoveryCodesRemaining: number;
}

/** A registered passkey as the settings page lists it. */
export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** The user's methods for the settings page (`GET /api/second-factor/methods`). */
export interface SecondFactorMethods {
  passkeys: PasskeySummary[];
  /** Whether an authenticator app is registered. */
  totp: boolean;
  recoveryCodesRemaining: number;
  /** Whether the session passed the second step recently enough to change them. */
  recentlyVerified: boolean;
}

/** Why the server refused a second-factor request. */
export type SecondFactorRefusal =
  | "invalid_code"
  | "too_many_attempts"
  | "unauthorized"
  | "already_enrolled"
  | "not_enrolled"
  | "no_pending_enrollment"
  | "invalid_passkey"
  | "no_pending_registration"
  | "reverification_required"
  | "second_factor_required"
  | "last_factor"
  | "not_found"
  | "unexpected";

const KNOWN = new Set<string>([
  "invalid_code",
  "too_many_attempts",
  "unauthorized",
  "already_enrolled",
  "not_enrolled",
  "no_pending_enrollment",
  "invalid_passkey",
  "no_pending_registration",
  "reverification_required",
  "second_factor_required",
  "last_factor",
  "not_found",
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

/**
 * Sends a request: a GET without `body`, a JSON POST with one, or `method` (DELETE) as given.
 * An empty 204 resolves to `{}`.
 */
async function call<T>(
  path: string,
  body?: Record<string, unknown>,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const res = await fetch(
    `/api/second-factor${path}`,
    method === "GET"
      ? undefined
      : {
          method,
          ...(body !== undefined && {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        },
  );
  if (res.status === 204) return {} as T;
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
  /**
   * For the first factor, the recovery codes come with the secret, before the first code
   * confirms it; adding an app to a passkey brings none.
   */
  startEnrollment: () =>
    call<{ secret: string; uri: string; recoveryCodes?: string[] }>("/totp/enrollment", {}),
  confirmEnrollment: (code: string) =>
    call<Record<string, never>>("/totp/enrollment/confirm", { code }),
  verifyTotp: (code: string) => call<Record<string, never>>("/totp/verify", { code }),
  verifyRecoveryCode: (code: string) =>
    call<{ recoveryCodesRemaining: number }>("/recovery-code/verify", { code }),
  /** Registration options; recovery codes too when the passkey is the first factor. */
  startPasskeyRegistration: () =>
    call<{ options: PublicKeyCredentialCreationOptionsJSON; recoveryCodes?: string[] }>(
      "/passkey/registration",
      {},
    ),
  confirmPasskeyRegistration: (response: RegistrationResponseJSON) =>
    call<Record<string, never>>("/passkey/registration/confirm", { response }),
  startPasskeyAuthentication: () =>
    call<{ options: PublicKeyCredentialRequestOptionsJSON }>("/passkey/authentication", {}),
  verifyPasskey: (response: AuthenticationResponseJSON) =>
    call<Record<string, never>>("/passkey/authentication/verify", { response }),
  /** What the settings page lists. Changing it needs `recentlyVerified`. */
  methods: () => call<SecondFactorMethods>("/methods"),
  /** Refused with `last_factor` when the passkey is the only method left. */
  deletePasskey: (id: string) =>
    call<Record<string, never>>(`/passkeys/${encodeURIComponent(id)}`, undefined, "DELETE"),
  /** Refused with `last_factor` when the app is the only method left. */
  deleteTotp: () => call<Record<string, never>>("/totp", undefined, "DELETE"),
  /** Replaces every recovery code; the old ones stop working. */
  newRecoveryCodes: () => call<{ recoveryCodes: string[] }>("/recovery-codes", {}),
};

/** The client the second-factor screen uses (swapped for a fake in its tests). */
export type SecondFactorApi = typeof secondFactorApi;
