import { openSecret, sealSecret } from "./secretBox";

/** How long an offer of new recovery codes can be confirmed: time to save them. */
export const OFFER_TTL_MS = 10 * 60_000;

/** The codes an offer switches to, as their hashes, under a new enrollment batch. */
export interface RecoveryOffer {
  batch: string;
  hashes: string[];
}

interface Sealed {
  u: string;
  s: string;
  b: string;
  h: string[];
  e: number;
}

const isSealed = (value: unknown): value is Sealed => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.u === "string" &&
    typeof v.s === "string" &&
    typeof v.b === "string" &&
    typeof v.e === "number" &&
    Array.isArray(v.h) &&
    v.h.every((hash) => typeof hash === "string")
  );
};

/**
 * Seals an offer of new recovery codes for one user's session. Nothing is stored: the offer is
 * handed to the browser with the codes and comes back when the user has saved them, so a lost
 * answer at either step loses no codes.
 * 新しい復旧用コードの提案を暗号化する。保存はせず、ブラウザに渡して保存後に戻してもらう。
 */
export async function sealOffer(
  authSecret: string,
  offer: RecoveryOffer & { userId: string; sessionId: string; now: number },
): Promise<string> {
  const payload: Sealed = {
    u: offer.userId,
    s: offer.sessionId,
    b: offer.batch,
    h: offer.hashes,
    e: offer.now + OFFER_TTL_MS,
  };
  return sealSecret(authSecret, JSON.stringify(payload), "recovery-code-offer");
}

/**
 * Opens an offer for the session that asked for it, before it expires; null otherwise (another
 * user or session, expired, changed, or not an offer at all).
 * 提案を開く。頼んだセッションで、期限内のときだけ。
 */
export async function openOffer(
  authSecret: string,
  sealed: string,
  expected: { userId: string; sessionId: string; now: number },
): Promise<RecoveryOffer | null> {
  const json = await openSecret(authSecret, sealed, "recovery-code-offer");
  if (json === null) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isSealed(payload)) return null;
  if (payload.u !== expected.userId || payload.s !== expected.sessionId) return null;
  if (expected.now >= payload.e) return null;
  return { batch: payload.b, hashes: payload.h };
}
