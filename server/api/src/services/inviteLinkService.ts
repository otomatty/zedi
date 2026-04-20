/**
 * ノート共有リンクのサービス。発行・取り消し・受諾を提供する。
 * 受諾は `SELECT ... FOR UPDATE` + `note_invite_link_redemptions` への
 * `INSERT ... ON CONFLICT DO NOTHING` を組み合わせることで、同時受諾時も
 * `usedCount` がオーバーカウントされないことを保証する。
 *
 * Note invite-link service: create / revoke / redeem.
 *
 * Redemption uses `SELECT ... FOR UPDATE` combined with an
 * `INSERT ... ON CONFLICT DO NOTHING` against `note_invite_link_redemptions`
 * so that concurrent redeems can never double-count `usedCount` and a single
 * user cannot consume a second slot by reloading the link.
 */
import { and, eq, sql } from "drizzle-orm";
import { noteInviteLinkRedemptions, noteInviteLinks, noteMembers } from "../schema/index.js";
import type { Database } from "../types/index.js";

/** 共有リンクのデフォルト TTL（7 日） / Default TTL (7 days). */
export const DEFAULT_INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 共有リンクの最大 TTL（90 日） / Max TTL allowed (90 days). */
export const MAX_INVITE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** 利用上限の最大値（UI 仕様 1..100） / Upper bound for `maxUses` via the UI. */
export const MAX_INVITE_LINK_USES = 100;

/**
 * リンクのロール。Phase 3 では `viewer` のみ許可する。
 * Link role. Phase 3 only accepts `viewer`; `editor` is Phase 5.
 */
export type InviteLinkRole = "viewer" | "editor";

/**
 * redeem 失敗の理由を構造化して返す。HTTP ステータスへのマッピングは
 * 呼び出し側（ルート）の責務とする。
 *
 * Structured failure codes from `redeemInviteLink`. HTTP status mapping is the
 * route layer's job.
 */
export type RedeemFailureReason =
  | "not_found"
  | "revoked"
  | "expired"
  | "exhausted"
  | "sign_in_required"
  | "member_email_missing";

/**
 * redeem の結果。`outcome` で新規参加 / 既存メンバー再訪を区別する。
 * Result of a redeem call. `outcome` distinguishes a fresh join from a
 * returning member (so the UI can show "既参加" without extra API calls).
 */
export type RedeemResult =
  | {
      ok: true;
      noteId: string;
      role: InviteLinkRole;
      /** 新規に `note_invite_link_redemptions` が INSERT された場合 `true` */
      isNewRedemption: boolean;
      /** 同一ユーザーの再クリック等で既に参加済みの場合 `true` */
      alreadyMember: boolean;
    }
  | { ok: false; reason: RedeemFailureReason };

/**
 * 暗号学的に安全なランダムトークン (32 bytes, hex) を生成する。
 * Generate a cryptographically secure 32-byte hex token.
 */
export function generateInviteLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 期限切れ / 取り消し / 上限到達を判定する。`now` は注入可能にしてテストを
 * 決定的に書けるようにする。
 *
 * Classify link validity. `now` is injectable so tests can be deterministic.
 */
export function classifyInviteLink(
  link: {
    expiresAt: Date;
    revokedAt: Date | null;
    maxUses: number | null;
    usedCount: number;
  },
  now: Date = new Date(),
): "valid" | "revoked" | "expired" | "exhausted" {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.maxUses !== null && link.usedCount >= link.maxUses) return "exhausted";
  return "valid";
}

/**
 * redeem 本体。トランザクション内で以下を実施する:
 *
 * 1. `FOR UPDATE` でリンク行をロック
 * 2. 取り消し / 期限切れ / 上限チェック
 * 3. `note_invite_link_redemptions` に `ON CONFLICT DO NOTHING` で INSERT
 * 4. INSERT が成立した場合のみ `usedCount` を +1
 * 5. `note_members` に upsert（既存 accepted は role を保持）
 *
 * The core redeem flow wrapped in a transaction. The combination of
 * `FOR UPDATE` + the unique constraint on `(link_id, redeemed_by_user_id)` is
 * what prevents both over-counting on concurrent redeems and re-counting on
 * repeat clicks by the same user.
 */
export interface RedeemInviteLinkParams {
  db: Database;
  token: string;
  redeemedByUserId: string;
  redeemedEmail: string;
  /** 現在時刻の注入ポイント（テスト用、デフォルトは `new Date()`） */
  now?: Date;
}

/**
 *
 */
export async function redeemInviteLink(params: RedeemInviteLinkParams): Promise<RedeemResult> {
  /**
   *
   */
  const { db, token, redeemedByUserId, redeemedEmail, now = new Date() } = params;

  /**
   *
   */
  const trimmedEmail = redeemedEmail.trim().toLowerCase();
  if (!trimmedEmail) {
    return { ok: false, reason: "member_email_missing" };
  }

  return db.transaction(async (tx) => {
    /**
     *
     */
    const [link] = await tx
      .select({
        id: noteInviteLinks.id,
        noteId: noteInviteLinks.noteId,
        role: noteInviteLinks.role,
        expiresAt: noteInviteLinks.expiresAt,
        maxUses: noteInviteLinks.maxUses,
        usedCount: noteInviteLinks.usedCount,
        revokedAt: noteInviteLinks.revokedAt,
        requireSignIn: noteInviteLinks.requireSignIn,
      })
      .from(noteInviteLinks)
      .where(eq(noteInviteLinks.token, token))
      .for("update")
      .limit(1);

    if (!link) return { ok: false, reason: "not_found" } as const;

    /**
     *
     */
    const classification = classifyInviteLink(link, now);
    if (classification !== "valid") {
      return { ok: false, reason: classification } as const;
    }

    // 受諾履歴に INSERT。`(link_id, redeemed_by_user_id)` のユニーク制約で
    // 同一ユーザーの 2 回目以降は黙って無視される（returning が空）。
    // Insert into the redemption log. The unique constraint makes repeat
    // redeems a silent no-op (empty returning).
    /**
     *
     */
    const inserted = await tx
      .insert(noteInviteLinkRedemptions)
      .values({
        linkId: link.id,
        redeemedByUserId,
        redeemedEmail: trimmedEmail,
      })
      .onConflictDoNothing({
        target: [noteInviteLinkRedemptions.linkId, noteInviteLinkRedemptions.redeemedByUserId],
      })
      .returning({ id: noteInviteLinkRedemptions.id });

    /**
     *
     */
    const isNewRedemption = inserted.length > 0;

    // 新規 redemption のみ usedCount を +1。maxUses に対する超過を避けるため
    // 条件付き UPDATE で「上限未到達な場合のみ加算」する。
    // Only bump usedCount when the redemption row was actually inserted, and
    // guard with a conditional update so concurrent FOR UPDATE winners
    // competing for the final slot still cannot push usedCount over maxUses.
    if (isNewRedemption) {
      await tx
        .update(noteInviteLinks)
        .set({ usedCount: sql`${noteInviteLinks.usedCount} + 1` })
        .where(
          and(
            eq(noteInviteLinks.id, link.id),
            // NULL (=無制限) or usedCount < maxUses を満たす場合のみ更新
            // Update only when unlimited OR still under maxUses.
            sql`(${noteInviteLinks.maxUses} IS NULL OR ${noteInviteLinks.usedCount} < ${noteInviteLinks.maxUses})`,
          ),
        );
    }

    // note_members に upsert。既存 accepted は role を維持する（リンク経由の
    // 昇格 / 降格を禁止）。取り消し済みフラグが立っていた場合は復活させる。
    // Upsert into note_members. Preserve role for already-accepted members —
    // link redeems must not upgrade or downgrade an existing membership.
    /**
     *
     */
    const [member] = await tx
      .insert(noteMembers)
      .values({
        noteId: link.noteId,
        memberEmail: trimmedEmail,
        role: link.role,
        invitedByUserId: redeemedByUserId,
        status: "accepted",
        acceptedUserId: redeemedByUserId,
      })
      .onConflictDoUpdate({
        target: [noteMembers.noteId, noteMembers.memberEmail],
        set: {
          // 既存が accepted かつ未削除なら role を維持。それ以外は link.role を採用。
          role: sql`CASE WHEN ${noteMembers.status} = 'accepted' AND ${noteMembers.isDeleted} = FALSE THEN ${noteMembers.role} ELSE ${link.role} END`,
          status: sql`'accepted'`,
          acceptedUserId: sql`COALESCE(${noteMembers.acceptedUserId}, ${redeemedByUserId})`,
          isDeleted: false,
          updatedAt: new Date(),
        },
      })
      .returning({
        role: noteMembers.role,
        status: noteMembers.status,
      });

    /**
     *
     */
    const alreadyMember = !isNewRedemption;

    return {
      ok: true,
      noteId: link.noteId,
      role: (member?.role ?? link.role) as InviteLinkRole,
      isNewRedemption,
      alreadyMember,
    } as const;
  });
}

/**
 * 発行時の入力検証。不正な値は `Error` を投げる（呼び出し側で 400 に変換）。
 * Validate creation input. Caller converts thrown errors into HTTP 400.
 */
export interface CreateInviteLinkInput {
  role?: string | null;
  expiresInMs?: number | null;
  maxUses?: number | null;
  label?: string | null;
  requireSignIn?: boolean | null;
}

/**
 *
 */
export interface NormalizedCreateInviteLinkInput {
  role: InviteLinkRole;
  expiresAt: Date;
  maxUses: number | null;
  label: string | null;
  requireSignIn: boolean;
}

/**
 * Phase 3 の viewer 限定ポリシーと各フィールドの境界チェックをここで一元化する。
 * Centralise the Phase-3 viewer-only policy and bounds checking.
 */
export function normalizeCreateInviteLinkInput(
  input: CreateInviteLinkInput,
  now: Date = new Date(),
): NormalizedCreateInviteLinkInput {
  const rawRole = input.role ?? "viewer";
  if (rawRole !== "viewer") {
    throw new Error("Phase 3 only allows the 'viewer' role for invite links");
  }
  const role: InviteLinkRole = rawRole;

  const expiresInMs = input.expiresInMs ?? DEFAULT_INVITE_LINK_TTL_MS;
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    throw new Error("expiresInMs must be a positive finite number");
  }
  if (expiresInMs > MAX_INVITE_LINK_TTL_MS) {
    throw new Error("expiresInMs exceeds the 90-day maximum");
  }
  const expiresAt = new Date(now.getTime() + expiresInMs);

  let maxUses: number | null = null;
  if (input.maxUses !== null && input.maxUses !== undefined) {
    if (!Number.isInteger(input.maxUses)) {
      throw new Error("maxUses must be an integer or null");
    }
    if (input.maxUses < 1 || input.maxUses > MAX_INVITE_LINK_USES) {
      throw new Error(`maxUses must be between 1 and ${MAX_INVITE_LINK_USES}`);
    }
    maxUses = input.maxUses;
  }

  const trimmedLabel = input.label ? input.label.trim() : "";
  const label = trimmedLabel.length > 0 ? trimmedLabel.slice(0, 200) : null;
  const requireSignIn = input.requireSignIn ?? true;

  return { role, expiresAt, maxUses, label, requireSignIn };
}
