/**
 * `notifier.ts` の単体テスト (Epic #616 Phase 3 / sub-issue #809)。
 *
 * 本プロジェクトでは外部通知をメール経由のみに限定する（Slack は使わない）。
 * テストは `emailService` を mock して、severity と環境変数の組み合わせで
 * 1 通だけ送られる / 送られないことを担保する。PII (Authorization / Cookie /
 * raw email) が本文に混入しないことも検証する。
 *
 * Unit tests for `notifier.ts` (Epic #616 Phase 3 / sub-issue #809). External
 * alerting is intentionally email-only (no Slack). Tests mock `emailService`
 * and assert send count for each (severity, env) combination, plus PII-safe
 * body content (no Authorization / Cookie / raw email leakage).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendEmail = vi.fn();

vi.mock("./emailService.js", () => ({
  sendEmail: mockSendEmail,
}));

// モック設定後にインポート / Import after mock setup
const { notifyApiErrorAlert } = await import("./notifier.js");

describe("notifyApiErrorAlert", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue({ success: true, id: "email_id_1" });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("MONITORING_NOTIFY_EMAIL 未設定なら送信しない (no-op)", async () => {
    delete process.env.MONITORING_NOTIFY_EMAIL;

    const result = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError: cannot read property",
    });

    expect(result.email.sent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("severity が low / unknown のときは送信しない", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";

    const lowResult = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-low",
      severity: "low",
      title: "minor",
    });
    const unknownResult = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000002",
      sentryIssueId: "sentry-unknown",
      severity: "unknown",
      title: "unclassified",
    });

    expect(lowResult.email.sent).toBe(false);
    expect(unknownResult.email.sent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("severity=high かつ MONITORING_NOTIFY_EMAIL 設定済みで 1 通だけ送る", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";

    const result = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError: cannot read property",
    });

    expect(result.email.sent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const args = mockSendEmail.mock.calls[0]?.[0];
    expect(args.to).toBe("ops@example.com");
    expect(args.subject).toContain("high");
    expect(args.subject).toContain("sentry-abc");
  });

  it("severity=medium でも送る", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";

    const result = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000003",
      sentryIssueId: "sentry-med",
      severity: "medium",
      title: "Latency spike",
    });

    expect(result.email.sent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("ADMIN_BASE_URL 設定時は管理画面 URL を本文に含める", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";
    process.env.ADMIN_BASE_URL = "https://admin.zedi-note.app";

    await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError",
    });

    const args = mockSendEmail.mock.calls[0]?.[0];
    expect(args.html).toContain(
      "https://admin.zedi-note.app/errors/00000000-0000-0000-0000-000000000001",
    );
  });

  it("ADMIN_BASE_URL 未設定時は URL を本文に含めない（no-op フォールバック）", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";
    delete process.env.ADMIN_BASE_URL;

    await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError",
    });

    const args = mockSendEmail.mock.calls[0]?.[0];
    // 管理画面 URL は載せないが、最低限 sentry_issue_id と severity は本文にある。
    // No admin URL is rendered, but sentry_issue_id and severity are still
    // present so an on-call can pivot to the Sentry issue directly.
    expect(args.html).not.toContain("http");
    expect(args.html).toContain("sentry-abc");
    expect(args.html).toContain("high");
  });

  it("ADMIN_BASE_URL が http:/https: 以外なら URL を載せない（防御的）", async () => {
    // operator が javascript:alert(1) や data: URL を誤設定しても、本文の
    // クリック可能リンクには絶対に流れ込まないことを確認する。
    //
    // Defense-in-depth against an operator typo: non-HTTP(S) schemes must
    // never make it into the alert HTML as a clickable link.
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";

    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "not-a-url",
      "   ",
    ]) {
      vi.clearAllMocks();
      mockSendEmail.mockResolvedValue({ success: true, id: "x" });
      process.env.ADMIN_BASE_URL = bad;
      await notifyApiErrorAlert({
        apiErrorId: "00000000-0000-0000-0000-000000000001",
        sentryIssueId: "sentry-abc",
        severity: "high",
        title: "TypeError",
      });
      const args = mockSendEmail.mock.calls[0]?.[0];
      expect(args.html).not.toContain("javascript:");
      expect(args.html).not.toContain("data:");
      expect(args.html).not.toContain("file:");
      expect(args.html).not.toContain("href=");
    }
  });

  it("件名から CR/LF を取り除く（header-injection 防御）", async () => {
    // sentryIssueId は実運用では英数記号のみだが、防御的に CR/LF を除去
    // した結果が件名に反映されることを確認する。
    //
    // Defense-in-depth: even if a malformed sentry_issue_id slips through,
    // CR/LF must not survive into the subject so SMTP transports can never
    // be tricked into header injection.
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";

    await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry\r\nBcc:attacker@example.com",
      severity: "high",
      title: "TypeError",
    });

    const args = mockSendEmail.mock.calls[0]?.[0];
    // 件名に CR/LF が残っていなければヘッダ折り返しによるヘッダ注入は不可能。
    // 文字列としての "Bcc:" は残るが、改行が挟まらないので別ヘッダにはならない。
    //
    // No CR/LF in the subject means an SMTP transport can't fold the line
    // into a new header. The literal "Bcc:" substring is harmless without a
    // preceding line break.
    expect(args.subject).not.toMatch(/[\r\n]/);
  });

  it("PII (Authorization / Cookie / raw email) を本文に含めない", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";
    process.env.ADMIN_BASE_URL = "https://admin.zedi-note.app";

    await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError",
    });

    const args = mockSendEmail.mock.calls[0]?.[0];
    const haystack = `${args.subject}\n${args.html}`.toLowerCase();
    expect(haystack).not.toContain("authorization");
    expect(haystack).not.toContain("cookie");
    expect(haystack).not.toContain("bearer ");
  });

  it("emailService が失敗しても throw せず success=false を返す", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";
    mockSendEmail.mockResolvedValueOnce({ success: false, error: "Rate limit" });

    const result = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError",
    });

    expect(result.email.sent).toBe(false);
    expect(result.email.error).toBe("Rate limit");
  });

  it("emailService が例外を投げても throw せず success=false を返す", async () => {
    process.env.MONITORING_NOTIFY_EMAIL = "ops@example.com";
    mockSendEmail.mockRejectedValueOnce(new Error("Network down"));

    const result = await notifyApiErrorAlert({
      apiErrorId: "00000000-0000-0000-0000-000000000001",
      sentryIssueId: "sentry-abc",
      severity: "high",
      title: "TypeError",
    });

    expect(result.email.sent).toBe(false);
    expect(result.email.error).toContain("Network down");
  });
});
