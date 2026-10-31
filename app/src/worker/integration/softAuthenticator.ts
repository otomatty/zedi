import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR, isoUint8Array } from "@simplewebauthn/server/helpers";

type Bytes = Uint8Array<ArrayBuffer>;

const sha256 = async (data: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", data));

const concat = (parts: Uint8Array[]): Bytes => isoUint8Array.concat(parts as Bytes[]) as Bytes;

const u32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** ECDSA signatures from Web Crypto are r‖s; WebAuthn wants ASN.1 DER. */
function derSignature(raw: Bytes): Bytes {
  const integer = (bytes: Bytes) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let value: Bytes = bytes.slice(start);
    if ((value[0] ?? 0) & 0x80) value = concat([new Uint8Array([0]), value]);
    return concat([new Uint8Array([0x02, value.length]), value]);
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  return concat([new Uint8Array([0x30, r.length + s.length]), r, s]);
}

/**
 * A software passkey for the workerd tests: an ES256 key pair that answers WebAuthn
 * registration and authentication options the way a platform authenticator would
 * (`none` attestation, user present and verified).
 * workerd の試験用のソフトウェアのパスキー。プラットフォームの認証器と同じように応答する。
 */
export class SoftAuthenticator {
  /** Signature counter; real platform authenticators often keep it at 0. */
  counter = 0;

  private constructor(
    private readonly keys: CryptoKeyPair,
    readonly credentialId: Bytes,
  ) {}

  /** A new authenticator with a fresh ES256 key pair and credential ID. */
  static async create(): Promise<SoftAuthenticator> {
    const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    return new SoftAuthenticator(keys, crypto.getRandomValues(new Uint8Array(16)));
  }

  /** The credential ID, base64url-encoded as WebAuthn JSON carries it. */
  get id(): string {
    return isoBase64URL.fromBuffer(this.credentialId);
  }

  private async cosePublicKey(): Promise<Bytes> {
    const jwk = (await crypto.subtle.exportKey("jwk", this.keys.publicKey)) as JsonWebKey;
    return isoCBOR.encode(
      new Map<number, number | Bytes>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, isoBase64URL.toBuffer(jwk.x ?? "")],
        [-3, isoBase64URL.toBuffer(jwk.y ?? "")],
      ]),
    ) as Bytes;
  }

  private clientData(type: string, challenge: string, origin: string): Bytes {
    return new TextEncoder().encode(
      JSON.stringify({ type, challenge, origin, crossOrigin: false }),
    ) as Bytes;
  }

  /** Answers `navigator.credentials.create()` for these options. */
  async register(
    options: PublicKeyCredentialCreationOptionsJSON,
    origin: string,
  ): Promise<RegistrationResponseJSON> {
    const rpIdHash = await sha256(new TextEncoder().encode(options.rp.id ?? "") as Bytes);
    const authData = concat([
      rpIdHash,
      new Uint8Array([0x45]), // user present, user verified, attested credential data
      u32(this.counter),
      new Uint8Array(16), // AAGUID
      new Uint8Array([0, this.credentialId.length]),
      this.credentialId,
      await this.cosePublicKey(),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never,
    );
    const clientDataJSON = this.clientData("webauthn.create", options.challenge, origin);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  /** Answers `navigator.credentials.get()` for these options. */
  async authenticate(
    options: PublicKeyCredentialRequestOptionsJSON,
    origin: string,
  ): Promise<AuthenticationResponseJSON> {
    const rpIdHash = await sha256(new TextEncoder().encode(options.rpId ?? "") as Bytes);
    const authData = concat([rpIdHash, new Uint8Array([0x05]), u32(this.counter)]);
    const clientDataJSON = this.clientData("webauthn.get", options.challenge, origin);
    const signed = concat([authData, await sha256(clientDataJSON)]);
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.keys.privateKey, signed),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        authenticatorData: isoBase64URL.fromBuffer(authData),
        signature: isoBase64URL.fromBuffer(derSignature(raw)),
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }
}
