/**
 * 招待サービスの単体テスト
 * Unit tests for invitationService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// sendEmail のモック / Mock sendEmail
const mockSendEmail = vi.fn();
vi.mock("./emailService.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// renderInviteNoteEmail & getInviteNoteSubject のモック / Mock email template
const mockRender = vi.fn();
const mockGetSubject = vi.fn();
vi.mock("../emails/invite-note.js", () => ({
  renderInviteNoteEmail: (...args: unknown[]) => mockRender(...args),
  getInviteNoteSubject: (...args: unknown[]) => mockGetSubject(...args),
}));

const { sendInvitation, resolveLocaleFromAcceptLanguage } = await import("./invitationService.js");

// ── Mock DB helper ──────────────────────────────────────────────────────────

function createMockDb(queryResults: unknown[][]) {
  let queryIndex = 0;
  return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_target, _prop: string) {
      return (..._args: unknown[]) => {
        const idx = queryIndex++;
        const result = queryResults[idx] ?? [];
        return makeChainProxy(result);
      };
    },
  });
}

function makeChainProxy(result: unknown[]): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === "then") {
        return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop === "catch") {
        return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
      }
      if (prop === "finally") {
        return (fn?: () => void) => Promise.resolve(result).finally(fn);
      }
      return (..._args: unknown[]) => makeChainProxy(result);
    },
  });
}

describe("sendInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRender.mockResolvedValue("<html>invite</html>");
    mockGetSubject.mockReturnValue("You are invited");
    mockSendEmail.mockResolvedValue({ success: true, id: "email_001" });
  });

  it("トークンを生成し、メールを送信する", async () => {
    const db = createMockDb([
      [{ title: "My Note" }], // notes select
      [{ name: "Taro" }], // users select
      [], // noteInvitations upsert
    ]);

    const result = await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "editor",
      invitedByUserId: "user-1",
    });

    expect(result.sent).toBe(true);
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        noteTitle: "My Note",
        inviterName: "Taro",
        role: "editor",
        locale: "ja",
      }),
    );
    expect(mockGetSubject).toHaveBeenCalledWith(
      expect.objectContaining({
        inviterName: "Taro",
        noteTitle: "My Note",
        locale: "ja",
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest@example.com",
        subject: "You are invited",
        html: "<html>invite</html>",
      }),
    );
  });

  it("ノートタイトルが null の場合はデフォルト値を使用する", async () => {
    const db = createMockDb([
      [{ title: null }], // notes select (null title)
      [{ name: "Taro" }], // users select
      [], // noteInvitations upsert
    ]);

    await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
    });

    expect(mockRender).toHaveBeenCalledWith(expect.objectContaining({ noteTitle: "Untitled" }));
  });

  it("メール送信失敗時は sent: false を返す", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "Rate limit" });

    const db = createMockDb([[{ title: "Note" }], [{ name: "User" }], []]);

    const result = await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
    });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("Rate limit");
  });

  it("例外発生時は sent: false を返す", async () => {
    const db = createMockDb([
      [{ title: "Note" }],
      [{ name: "User" }],
      [], // noteInvitations upsert
    ]);

    // テンプレートレンダリングで例外を発生させる
    // Make template rendering throw an error
    mockRender.mockRejectedValue(new Error("Render failed"));

    const result = await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
    });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("Render failed");
  });

  it("inviteUrl にトークンが含まれる", async () => {
    const db = createMockDb([[{ title: "Test" }], [{ name: "Sender" }], []]);

    await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
    });

    const renderCall = mockRender.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(renderCall.inviteUrl).toMatch(/\/invite\?token=[a-f0-9]{64}$/);
  });

  it("params.locale が 'en' なら INSERT ロケールとしてテンプレートへ渡す", async () => {
    // 初回 INSERT 時は呼び出し元から渡された locale がそのまま使われる。
    // On INSERT the explicit locale is applied and used for rendering.
    const db = createMockDb([
      [{ title: "Note" }],
      [{ name: "User" }],
      [{ locale: "en" }], // .returning({ locale })
    ]);

    await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
      locale: "en",
    });

    expect(mockRender).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
    expect(mockGetSubject).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });

  it("再送時は DB の既存ロケールが優先される（元招待の言語を保持）", async () => {
    // 呼び出し側が 'en' を渡しても、ON CONFLICT で既存行の locale ('ja') が返り、
    // そちらを効果的ロケールとして採用する。
    // Even if caller passes 'en', ON CONFLICT returns the existing row's locale ('ja');
    // that value wins so the resend keeps the original invite language.
    const db = createMockDb([
      [{ title: "Note" }],
      [{ name: "User" }],
      [{ locale: "ja" }], // returning — existing row locale preserved
    ]);

    await sendInvitation({
      db: db as never,
      noteId: "note-1",
      memberEmail: "guest@example.com",
      role: "viewer",
      invitedByUserId: "user-1",
      locale: "en",
    });

    expect(mockRender).toHaveBeenCalledWith(expect.objectContaining({ locale: "ja" }));
  });
});

describe("resolveLocaleFromAcceptLanguage", () => {
  it("空ヘッダは null を返す", () => {
    expect(resolveLocaleFromAcceptLanguage(undefined)).toBeNull();
    expect(resolveLocaleFromAcceptLanguage(null)).toBeNull();
    expect(resolveLocaleFromAcceptLanguage("")).toBeNull();
  });

  it("最優先のサポート言語を返す（品質値の降順）", () => {
    expect(resolveLocaleFromAcceptLanguage("en-US,en;q=0.9,ja;q=0.5")).toBe("en");
    expect(resolveLocaleFromAcceptLanguage("ja,en-US;q=0.8")).toBe("ja");
    expect(resolveLocaleFromAcceptLanguage("ja-JP")).toBe("ja");
  });

  it("q 値が高いものを優先する", () => {
    expect(resolveLocaleFromAcceptLanguage("ja;q=0.3,en;q=0.9")).toBe("en");
  });

  it("非サポート言語は無視しフォールバックを適用する", () => {
    expect(resolveLocaleFromAcceptLanguage("fr-FR,de;q=0.7")).toBeNull();
    expect(resolveLocaleFromAcceptLanguage("fr-FR,de;q=0.7,en;q=0.1")).toBe("en");
  });
});
