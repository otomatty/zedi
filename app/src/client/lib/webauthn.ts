import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
};

/** The browser's passkey prompts, injected so the screen can be tested without them. */
export interface WebAuthnClient {
  supported(): boolean;
  register(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON>;
  authenticate(options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON>;
}

/**
 * Whether passkeys can work on this host: WebAuthn needs a domain name as the relying party, so
 * an IP address (such as `127.0.0.1` in local runs) cannot have one; `localhost` can.
 * このホストでパスキーを使えるか。IP アドレスは WebAuthn の RP にできない（localhost はできる）。
 */
export function passkeysUsableOn(hostname: string): boolean {
  return !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && !hostname.startsWith("[");
}

/** The real prompts (`navigator.credentials`), through SimpleWebAuthn's browser helpers. */
export const browserWebAuthn: WebAuthnClient = {
  supported: () => browserSupportsWebAuthn() && passkeysUsableOn(location.hostname),
  register: (optionsJSON) => startRegistration({ optionsJSON }),
  authenticate: (optionsJSON) => startAuthentication({ optionsJSON }),
};

/** Why a passkey prompt did not produce a credential. */
export type PasskeyFailure = "cancelled" | "alreadyRegistered" | "failed";

/**
 * Sorts a prompt's error: dismissed or timed out (the browser does not say which), an
 * authenticator that already holds one of the user's passkeys, or anything else.
 * パスキーの操作が失敗した理由を分ける（取り消し・時間切れ、登録済みの認証器、それ以外）。
 */
export function passkeyFailure(error: unknown): PasskeyFailure {
  if (!(error instanceof Error)) return "failed";
  const code = (error as { code?: unknown }).code;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "alreadyRegistered";
  if (code === "ERROR_CEREMONY_ABORTED") return "cancelled";
  return error.name === "NotAllowedError" || error.name === "AbortError" ? "cancelled" : "failed";
}
