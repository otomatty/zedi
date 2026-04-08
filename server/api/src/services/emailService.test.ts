/**
 * emailService の単体テスト
 * Unit tests for emailService
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send: mockSend };
    },
  };
});

// モック設定後にインポート / Import after mock setup
const { sendEmail, _resetClient } = await import("./emailService.js");

describe("sendEmail", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    _resetClient();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("RESEND_API_KEY 未設定の場合、送信しない", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY not set");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("API キーが設定されていれば送信成功", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mockSend.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Invitation",
      html: "<p>You are invited</p>",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe("email_123");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Invitation",
        html: "<p>You are invited</p>",
      }),
    );
  });

  it("Resend API エラー時は success: false を返す", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "Rate limit exceeded" },
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limit exceeded");
  });

  it("例外発生時は success: false を返す", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mockSend.mockRejectedValueOnce(new Error("Network error"));

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error");
  });

  it("RESEND_FROM_EMAIL のデフォルト値を使用する", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.RESEND_FROM_EMAIL;
    mockSend.mockResolvedValueOnce({ data: { id: "email_456" }, error: null });

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      html: "<p>Hello</p>",
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@zedi-note.app",
      }),
    );
  });
});
