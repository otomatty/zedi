/**
 * Client for `/api/user/ai-credentials` (#951).
 */

export type UserAiCredentialProvider = "anthropic" | "openai" | "google";

export interface UserAiCredentialAvailability {
  provider: UserAiCredentialProvider;
  configured: boolean;
}

export interface UserAiCredentialsStatus {
  storageEnabled: boolean;
  providers: UserAiCredentialAvailability[];
}

const getApiBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

const REST_OPTS: RequestInit = { credentials: "include" };

async function jsonOrThrow<T>(res: Response, hint: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = await res.json().catch(() => null);
  const message =
    (body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : null) ?? `${hint} failed: ${res.status}`;
  throw new Error(message);
}

/** Fetch which BYOK providers have server-stored credentials. */
export async function fetchUserAiCredentialsStatus(): Promise<UserAiCredentialsStatus> {
  const res = await fetch(`${getApiBaseUrl()}/api/user/ai-credentials`, REST_OPTS);
  return jsonOrThrow<UserAiCredentialsStatus>(res, "fetchUserAiCredentialsStatus");
}

/** Store an encrypted credential for a provider. */
export async function upsertUserAiCredential(
  provider: UserAiCredentialProvider,
  apiKey: string,
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/user/ai-credentials/${provider}`, {
    ...REST_OPTS,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  await jsonOrThrow(res, "upsertUserAiCredential");
}

/** Remove a stored credential. */
export async function deleteUserAiCredential(provider: UserAiCredentialProvider): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/user/ai-credentials/${provider}`, {
    ...REST_OPTS,
    method: "DELETE",
  });
  await jsonOrThrow(res, "deleteUserAiCredential");
}
