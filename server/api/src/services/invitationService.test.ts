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

const { sendInvitation } = await import("./invitationService.js");

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
});
