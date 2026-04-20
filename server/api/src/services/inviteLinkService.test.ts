/**
 * 共有リンクサービスの単体テスト。
 * Unit tests for inviteLinkService.
 *
 * 同時 redeem の integration テスト（Postgres 実行環境が必要）は
 * 別スコープとし、ここでは以下を検証する:
 *
 * - 入力バリデーション（Phase 5: viewer / editor 双方を許容）
 * - 状態判定 (valid / revoked / expired / exhausted)
 * - redeem のフロー制御 (取り消し・期限切れ・上限到達・再クリック・新規参加)
 *
 * Concurrency (10 parallel redeems) requires a real Postgres harness to verify
 * FOR UPDATE + ON CONFLICT semantics; that integration test lives outside this
 * unit-test file. Here we lock down the deterministic branches.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_INVITE_LINK_TTL_MS,
  MAX_INVITE_LINK_TTL_MS,
  MAX_INVITE_LINK_USES,
  classifyInviteLink,
  generateInviteLinkToken,
  normalizeCreateInviteLinkInput,
  redeemInviteLink,
} from "./inviteLinkService.js";
import { noteInviteLinkRedemptions, noteInviteLinks, noteMembers } from "../schema/index.js";
import type { Database } from "../types/index.js";

// ── generateInviteLinkToken ────────────────────────────────────────────────

describe("generateInviteLinkToken", () => {
  it("returns a 64-character lowercase hex string (32 bytes)", () => {
    const token = generateInviteLinkToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique values across calls", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) tokens.add(generateInviteLinkToken());
    expect(tokens.size).toBe(50);
  });
});

// ── classifyInviteLink ─────────────────────────────────────────────────────

describe("classifyInviteLink", () => {
  const base = {
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    revokedAt: null as Date | null,
    maxUses: null as number | null,
    usedCount: 0,
  };
  const now = new Date("2026-04-20T00:00:00Z");

  it("returns 'valid' for an active link without usage limits", () => {
    expect(classifyInviteLink(base, now)).toBe("valid");
  });

  it("returns 'revoked' when revokedAt is set (even if not expired)", () => {
    expect(classifyInviteLink({ ...base, revokedAt: new Date("2026-04-19T00:00:00Z") }, now)).toBe(
      "revoked",
    );
  });

  it("returns 'expired' when expiresAt is in the past", () => {
    expect(classifyInviteLink({ ...base, expiresAt: new Date("2026-04-19T00:00:00Z") }, now)).toBe(
      "expired",
    );
  });

  it("treats expiresAt equal to now as expired (strict)", () => {
    expect(classifyInviteLink({ ...base, expiresAt: now }, now)).toBe("expired");
  });

  it("returns 'exhausted' when usedCount >= maxUses", () => {
    expect(classifyInviteLink({ ...base, maxUses: 10, usedCount: 10 }, now)).toBe("exhausted");
  });

  it("prioritises revoked over expired and exhausted", () => {
    expect(
      classifyInviteLink(
        {
          expiresAt: new Date("2020-01-01T00:00:00Z"),
          revokedAt: new Date("2026-01-01T00:00:00Z"),
          maxUses: 1,
          usedCount: 99,
        },
        now,
      ),
    ).toBe("revoked");
  });
});

// ── normalizeCreateInviteLinkInput ─────────────────────────────────────────

describe("normalizeCreateInviteLinkInput", () => {
  const now = new Date("2026-04-20T00:00:00Z");

  it("applies defaults (viewer, 7 days, null maxUses, requireSignIn=true)", () => {
    const result = normalizeCreateInviteLinkInput({}, now);
    expect(result.role).toBe("viewer");
    expect(result.expiresAt.getTime() - now.getTime()).toBe(DEFAULT_INVITE_LINK_TTL_MS);
    expect(result.maxUses).toBeNull();
    expect(result.label).toBeNull();
    expect(result.requireSignIn).toBe(true);
  });

  it("accepts editor role (Phase 5)", () => {
    const result = normalizeCreateInviteLinkInput({ role: "editor" }, now);
    expect(result.role).toBe("editor");
    // editor リンクは必ず requireSignIn=true にフォースされる (発行時の安全側制約)。
    // editor links must be forced to requireSignIn=true at creation.
    expect(result.requireSignIn).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(() => normalizeCreateInviteLinkInput({ role: "admin" }, now)).toThrow(/role/);
  });

  it("forces requireSignIn=true for editor links even when caller explicitly sends true", () => {
    // editor リンクは DB では toggle 可能だが API では常に true (#662 仕様)。
    // requireSignIn flag is DB-mutable but the API always coerces editor links to true.
    const result = normalizeCreateInviteLinkInput({ role: "editor", requireSignIn: true }, now);
    expect(result.requireSignIn).toBe(true);
  });

  it("rejects non-positive or non-finite TTLs", () => {
    expect(() => normalizeCreateInviteLinkInput({ expiresInMs: 0 }, now)).toThrow();
    expect(() => normalizeCreateInviteLinkInput({ expiresInMs: -1 }, now)).toThrow();
    expect(() =>
      normalizeCreateInviteLinkInput({ expiresInMs: Number.POSITIVE_INFINITY }, now),
    ).toThrow();
  });

  it("rejects TTLs beyond the 90-day max", () => {
    expect(() =>
      normalizeCreateInviteLinkInput({ expiresInMs: MAX_INVITE_LINK_TTL_MS + 1 }, now),
    ).toThrow(/90-day/);
  });

  it("rejects maxUses outside 1..100 but accepts null", () => {
    expect(() => normalizeCreateInviteLinkInput({ maxUses: 0 }, now)).toThrow();
    expect(() =>
      normalizeCreateInviteLinkInput({ maxUses: MAX_INVITE_LINK_USES + 1 }, now),
    ).toThrow();
    expect(() => normalizeCreateInviteLinkInput({ maxUses: 1.5 }, now)).toThrow();
    expect(normalizeCreateInviteLinkInput({ maxUses: null }, now).maxUses).toBeNull();
    expect(normalizeCreateInviteLinkInput({ maxUses: 42 }, now).maxUses).toBe(42);
  });

  it("trims labels and drops empty ones", () => {
    expect(normalizeCreateInviteLinkInput({ label: "  " }, now).label).toBeNull();
    expect(normalizeCreateInviteLinkInput({ label: "  Slack " }, now).label).toBe("Slack");
  });

  it("truncates very long labels to 200 chars", () => {
    const long = "a".repeat(500);
    const result = normalizeCreateInviteLinkInput({ label: long }, now);
    expect(result.label?.length).toBe(200);
  });
});

// ── redeemInviteLink ───────────────────────────────────────────────────────

/**
 * In-memory fake DB covering just the method chain that `redeemInviteLink`
 * uses. Every call mutates shared state so the test can observe usedCount
 * progression across a sequence of calls.
 *
 * redeemInviteLink が呼び出す最小のチェーンだけを実装した、状態を持つフェイク
 * DB。共有された state を変更するため usedCount の進み方をテストで観測できる。
 */
interface FakeLinkRow {
  id: string;
  noteId: string;
  token: string;
  role: "viewer" | "editor";
  createdByUserId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  requireSignIn: boolean;
  /** リンクが指すノートが論理削除済みかを模擬する（INNER JOIN のフィルタ相当） */
  noteIsDeleted: boolean;
}

interface FakeRedemptionRow {
  linkId: string;
  redeemedByUserId: string;
  redeemedEmail: string;
}

interface FakeMemberRow {
  noteId: string;
  memberEmail: string;
  role: "viewer" | "editor";
  /** リンク経由の再受諾で更新されないか検証するために記録する */
  invitedByUserId: string;
  status: "pending" | "accepted" | "declined";
  acceptedUserId: string | null;
  isDeleted: boolean;
}

interface FakeState {
  links: FakeLinkRow[];
  redemptions: FakeRedemptionRow[];
  members: FakeMemberRow[];
}

/**
 * redeemInviteLink の内部で使われる drizzle チェーンを最小限に再現する。
 * 実装詳細に依存しないよう「呼び出し順」ではなく「呼び出し内容」で分岐する。
 *
 * Minimal mock of the drizzle chain `redeemInviteLink` uses. Branches on the
 * *kind* of the call (select / insert / update) rather than the exact order,
 * so refactors within the service don't silently break the tests.
 */
function createFakeDb(state: FakeState): Database {
  type ChainOp =
    | "select-link"
    | "select-redemption"
    | "insert-redemption"
    | "insert-member"
    | "update-link";
  type Chain = {
    op: ChainOp;
    pendingToken?: string;
    pendingLookupUserId?: string;
    pendingRedemption?: { linkId: string; userId: string; email: string };
    pendingMember?: {
      noteId: string;
      memberEmail: string;
      role: "viewer" | "editor";
      invitedByUserId: string;
      acceptedUserId: string;
    };
    pendingUpdate?: { linkId: string };
    resolve: () => Promise<unknown>;
  };

  function makeSelectLink(): Chain {
    const chain: Chain = {
      op: "select-link",
      resolve: async () => {
        const link = state.links.find((l) => l.token === chain.pendingToken && !l.noteIsDeleted);
        return link
          ? [
              {
                id: link.id,
                noteId: link.noteId,
                role: link.role,
                createdByUserId: link.createdByUserId,
                expiresAt: link.expiresAt,
                maxUses: link.maxUses,
                usedCount: link.usedCount,
                revokedAt: link.revokedAt,
                requireSignIn: link.requireSignIn,
              },
            ]
          : [];
      },
    };
    return chain;
  }

  function makeSelectRedemption(): Chain {
    const chain: Chain = {
      op: "select-redemption",
      resolve: async () => {
        const row = state.redemptions.find(
          (r) =>
            r.linkId === chain.pendingRedemption?.linkId &&
            r.redeemedByUserId === chain.pendingLookupUserId,
        );
        return row ? [{ id: "r-existing" }] : [];
      },
    };
    return chain;
  }

  function makeInsert(table: unknown, values: Record<string, unknown>): Chain {
    if (table === noteInviteLinkRedemptions) {
      const chain: Chain = {
        op: "insert-redemption",
        pendingRedemption: {
          linkId: String(values.linkId),
          userId: String(values.redeemedByUserId),
          email: String(values.redeemedEmail),
        },
        resolve: async () => [],
      };
      chain.resolve = async () => {
        const pending = chain.pendingRedemption;
        if (!pending) return [];
        const { linkId, userId, email } = pending;
        const exists = state.redemptions.some(
          (r) => r.linkId === linkId && r.redeemedByUserId === userId,
        );
        if (exists) return [];
        state.redemptions.push({
          linkId,
          redeemedByUserId: userId,
          redeemedEmail: email,
        });
        return [{ id: `r-${state.redemptions.length}` }];
      };
      return chain;
    }
    // insert into note_members
    const chain: Chain = {
      op: "insert-member",
      pendingMember: {
        noteId: String(values.noteId),
        memberEmail: String(values.memberEmail),
        role: values.role as "viewer" | "editor",
        invitedByUserId: String(values.invitedByUserId),
        acceptedUserId: String(values.acceptedUserId),
      },
      resolve: async () => [],
    };
    chain.resolve = async () => {
      const pending = chain.pendingMember;
      if (!pending) return [];
      const { noteId, memberEmail, role, invitedByUserId, acceptedUserId } = pending;
      const existing = state.members.find(
        (m) => m.noteId === noteId && m.memberEmail === memberEmail,
      );
      if (!existing) {
        const row: FakeMemberRow = {
          noteId,
          memberEmail,
          role,
          invitedByUserId,
          status: "accepted",
          acceptedUserId,
          isDeleted: false,
        };
        state.members.push(row);
        return [{ role: row.role, status: row.status }];
      }
      // Preserve role for accepted + not deleted; otherwise adopt link role.
      const keepRole = existing.status === "accepted" && !existing.isDeleted;
      existing.role = keepRole ? existing.role : role;
      existing.status = "accepted";
      existing.acceptedUserId = existing.acceptedUserId ?? acceptedUserId;
      existing.isDeleted = false;
      return [{ role: existing.role, status: existing.status }];
    };
    return chain;
  }

  function makeUpdate(): Chain {
    const chain: Chain = {
      op: "update-link",
      pendingUpdate: { linkId: "" },
      resolve: async () => {
        const pending = chain.pendingUpdate;
        if (!pending) return [];
        const link = state.links.find((l) => l.id === pending.linkId);
        if (!link) return [];
        const withinCap = link.maxUses === null || link.usedCount < link.maxUses;
        if (withinCap) link.usedCount += 1;
        return [];
      },
    };
    return chain;
  }

  function wrapChain(chain: Chain): Promise<unknown> {
    return new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            chain.resolve().then(resolve, reject);
        }
        if (prop === "catch") {
          return (reject?: (e: unknown) => unknown) => chain.resolve().catch(reject);
        }
        if (prop === "finally") {
          return (fn?: () => void) => chain.resolve().finally(fn);
        }
        if (prop === "where") {
          return (cond: unknown) => {
            if (chain.op === "select-link") {
              const token = extractStringValueFromCondition(cond);
              if (token) chain.pendingToken = token;
            }
            if (chain.op === "select-redemption") {
              const [linkId, userId] = extractAllStringValuesFromCondition(cond);
              if (linkId) {
                chain.pendingRedemption = {
                  linkId,
                  userId: userId ?? "",
                  email: "",
                };
              }
              if (userId) chain.pendingLookupUserId = userId;
            }
            if (chain.op === "update-link" && chain.pendingUpdate) {
              const linkId = extractLinkIdFromAndCondition(cond);
              if (linkId) chain.pendingUpdate.linkId = linkId;
            }
            return wrapChain(chain);
          };
        }
        // Any other method (values/onConflictDoNothing/onConflictDoUpdate/
        // for/limit/returning/set/innerJoin/leftJoin) is a no-op that keeps
        // the chain.
        return (..._args: unknown[]) => wrapChain(chain);
      },
    }) as unknown as Promise<unknown>;
  }

  const db: Record<string, unknown> = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    select: (_fields?: unknown) => ({
      from: (table: unknown) => {
        if (table === noteInviteLinkRedemptions) {
          return wrapChain(makeSelectRedemption());
        }
        // Default: any other `.from(table)` including `select().from(noteInviteLinks)`
        // is treated as a link lookup (the service only issues link + redemption
        // selects, so this is deterministic).
        void noteInviteLinks;
        return wrapChain(makeSelectLink());
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => wrapChain(makeInsert(table, values)),
    }),
    update: (_table: unknown) => ({
      set: (_values: Record<string, unknown>) => wrapChain(makeUpdate()),
    }),
  };
  void noteMembers;

  return db as unknown as Database;
}

/**
 * drizzle の `eq(noteInviteLinks.token, "abc")` は SQL chunk 列に展開される。
 * テスト内ではリテラル値を取り出せれば十分なので、文字列を含む要素を返す。
 *
 * drizzle's `eq(col, value)` expands to an SQL chunks array; we only need the
 * string literal the caller bound for mock routing.
 */
/**
 * drizzle の `eq` / `and` を走査し、含まれる最初の string パラメータ値を返す。
 * Walk a drizzle SQL tree and return the first string parameter value.
 */
function extractStringValueFromCondition(cond: unknown): string | null {
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const value = (node as { value?: unknown }).value;
    if (typeof value === "string") return value;
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      for (const c of chunks) {
        const found = visit(c);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return visit(cond);
}

/**
 * drizzle の `and(eq(col, a), eq(col, b))` から、出現順に string 値を 2 つ拾う。
 * Collect up to two string parameter values from an `and(eq, eq)` tree.
 */
function extractAllStringValuesFromCondition(cond: unknown): [string | null, string | null] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const value = (node as { value?: unknown }).value;
    if (typeof value === "string") found.push(value);
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) for (const c of chunks) visit(c);
  };
  visit(cond);
  return [found[0] ?? null, found[1] ?? null];
}

function extractLinkIdFromAndCondition(cond: unknown): string | null {
  // Drizzle の AND ノードはサブ条件を持つ。ここでは最も単純に、文字列値を
  // 再帰的に拾う（update の where には link.id を 1 つだけ束縛している）。
  // Walk a Drizzle AND tree recursively and pick up the first UUID-shaped
  // string parameter — update's where only binds link.id once.
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) {
      for (const c of chunks) {
        const found = visit(c);
        if (found) return found;
      }
    }
    const value = (node as { value?: unknown }).value;
    if (typeof value === "string" && /^[0-9a-f-]{8,}/i.test(value)) return value;
    return null;
  };
  return visit(cond);
}

/**
 * デフォルトの発行者 ID（受諾者と区別しやすい値にする）。
 * Default link-creator ID; chosen so it's easy to distinguish from redeemers.
 */
const DEFAULT_LINK_CREATOR_ID = "creator-user";

function makeLink(overrides: Partial<FakeLinkRow> = {}): FakeLinkRow {
  return {
    id: "00000000-0000-0000-0000-00000000aaaa",
    noteId: "11111111-1111-1111-1111-111111111111",
    token: "token-valid",
    role: "viewer",
    createdByUserId: DEFAULT_LINK_CREATOR_ID,
    expiresAt: new Date(Date.now() + DEFAULT_INVITE_LINK_TTL_MS),
    revokedAt: null,
    maxUses: null,
    usedCount: 0,
    requireSignIn: true,
    noteIsDeleted: false,
    ...overrides,
  };
}

describe("redeemInviteLink", () => {
  it("returns not_found when the token does not exist", async () => {
    const state: FakeState = { links: [], redemptions: [], members: [] };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "missing",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns revoked when the link has been revoked", async () => {
    const state: FakeState = {
      links: [makeLink({ revokedAt: new Date("2026-04-19T00:00:00Z") })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result).toEqual({ ok: false, reason: "revoked" });
    expect(state.redemptions).toHaveLength(0);
    expect(state.members).toHaveLength(0);
  });

  it("returns expired when the link is past expiresAt", async () => {
    const state: FakeState = {
      links: [makeLink({ expiresAt: new Date("2026-04-01T00:00:00Z") })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(state.redemptions).toHaveLength(0);
  });

  it("returns exhausted when usedCount has reached maxUses", async () => {
    const state: FakeState = {
      links: [makeLink({ maxUses: 5, usedCount: 5 })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "exhausted" });
  });

  it("returns member_email_missing when the email is blank", async () => {
    const state: FakeState = {
      links: [makeLink()],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "   ",
    });
    expect(result).toEqual({ ok: false, reason: "member_email_missing" });
  });

  it("increments usedCount exactly once on a first redeem", async () => {
    const state: FakeState = {
      links: [makeLink({ maxUses: 3, usedCount: 0 })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);
    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isNewRedemption).toBe(true);
      expect(result.alreadyMember).toBe(false);
      expect(result.role).toBe("viewer");
    }
    expect(state.links[0]?.usedCount).toBe(1);
    expect(state.redemptions).toHaveLength(1);
    expect(state.members).toHaveLength(1);
  });

  it("does not re-increment usedCount when the same user redeems twice", async () => {
    const state: FakeState = {
      links: [makeLink({ maxUses: 3, usedCount: 0 })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);

    const first = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });
    const second = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });

    expect(first.ok && first.isNewRedemption).toBe(true);
    expect(second.ok && second.alreadyMember).toBe(true);
    expect(state.links[0]?.usedCount).toBe(1);
    expect(state.redemptions).toHaveLength(1);
  });

  it("increments usedCount once per distinct user and stops at maxUses", async () => {
    const state: FakeState = {
      links: [makeLink({ maxUses: 3, usedCount: 0 })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);

    const users = ["u1", "u2", "u3", "u4"];
    const results: Array<Awaited<ReturnType<typeof redeemInviteLink>>> = [];
    for (const u of users) {
      results.push(
        await redeemInviteLink({
          db,
          token: "token-valid",
          redeemedByUserId: u,
          redeemedEmail: `${u}@example.com`,
        }),
      );
    }

    // First 3 succeed, 4th is exhausted.
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toEqual({ ok: false, reason: "exhausted" });
    expect(state.links[0]?.usedCount).toBe(3);
  });

  it("preserves the existing role when an accepted member redeems a link", async () => {
    const state: FakeState = {
      links: [makeLink({ role: "viewer" })],
      redemptions: [],
      members: [
        {
          noteId: "11111111-1111-1111-1111-111111111111",
          memberEmail: "u1@example.com",
          role: "editor",
          invitedByUserId: "someone-else",
          status: "accepted",
          acceptedUserId: "u1",
          isDeleted: false,
        },
      ],
    };
    const db = createFakeDb(state);

    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Existing editor retains editor role — link must not downgrade.
      expect(result.role).toBe("editor");
    }
    expect(state.members[0]?.role).toBe("editor");
  });

  it("treats soft-deleted notes as not_found and never touches memberships", async () => {
    const state: FakeState = {
      links: [makeLink({ noteIsDeleted: true })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);

    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(state.redemptions).toHaveLength(0);
    expect(state.members).toHaveLength(0);
  });

  it("records the link creator as invitedByUserId (audit trail, not self-invite)", async () => {
    const state: FakeState = {
      links: [makeLink({ createdByUserId: "alice" })],
      redemptions: [],
      members: [],
    };
    const db = createFakeDb(state);

    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "bob",
      redeemedEmail: "bob@example.com",
    });

    expect(result.ok).toBe(true);
    expect(state.members[0]?.invitedByUserId).toBe("alice");
    expect(state.members[0]?.acceptedUserId).toBe("bob");
  });

  it(
    "returns idempotent success when the same user redeems after maxUses is consumed " +
      "(repeat click must not flip to exhausted)",
    async () => {
      const state: FakeState = {
        links: [makeLink({ maxUses: 1, usedCount: 0 })],
        redemptions: [],
        members: [],
      };
      const db = createFakeDb(state);

      const first = await redeemInviteLink({
        db,
        token: "token-valid",
        redeemedByUserId: "u1",
        redeemedEmail: "u1@example.com",
      });
      // After the first redeem the link is now "exhausted" for strangers.
      const second = await redeemInviteLink({
        db,
        token: "token-valid",
        redeemedByUserId: "u1",
        redeemedEmail: "u1@example.com",
      });

      expect(first.ok).toBe(true);
      if (first.ok) expect(first.isNewRedemption).toBe(true);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.isNewRedemption).toBe(false);
        expect(second.alreadyMember).toBe(true);
      }
      expect(state.links[0]?.usedCount).toBe(1);
      expect(state.redemptions).toHaveLength(1);
    },
  );

  it("still blocks repeat redeem attempts when the link has been revoked", async () => {
    const state: FakeState = {
      links: [makeLink({ maxUses: 1, usedCount: 1, revokedAt: new Date("2026-01-01") })],
      redemptions: [
        {
          linkId: "00000000-0000-0000-0000-00000000aaaa",
          redeemedByUserId: "u1",
          redeemedEmail: "u1@example.com",
        },
      ],
      members: [],
    };
    const db = createFakeDb(state);

    const result = await redeemInviteLink({
      db,
      token: "token-valid",
      redeemedByUserId: "u1",
      redeemedEmail: "u1@example.com",
    });

    // Even an already-redeemed user must not re-acquire membership through a
    // revoked link. Only exhausted is relaxed for repeat redeems.
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });
});

// ── normalizeCreateInviteLinkInput: auth / requireSignIn ──────────────────

describe("normalizeCreateInviteLinkInput — requireSignIn", () => {
  it("rejects requireSignIn: false for viewer (Phase 3 is auth-only)", () => {
    expect(() => normalizeCreateInviteLinkInput({ role: "viewer", requireSignIn: false })).toThrow(
      /must require sign-in/,
    );
  });

  it("silently forces requireSignIn=true for editor links (Phase 5 safety)", () => {
    // editor はユーザーが明示 false を送っても常に true に上書きする。
    // 監査ログ / UI はこのフィールドを「editor リンクは必ずサインイン必須」と
    // 表示するため、API 境界で必ず揃える。
    //
    // Editor links always force requireSignIn=true, silently overwriting an
    // explicit `false` from the client (spec #662 safety rail).
    const result = normalizeCreateInviteLinkInput({ role: "editor", requireSignIn: false });
    expect(result.requireSignIn).toBe(true);
  });

  it("accepts omitted or explicit true as true", () => {
    expect(normalizeCreateInviteLinkInput({}).requireSignIn).toBe(true);
    expect(normalizeCreateInviteLinkInput({ requireSignIn: true }).requireSignIn).toBe(true);
  });
});
