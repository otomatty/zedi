/**
 * NoteMembersManageSection のバッジ派生状態テスト。
 * Tests for NoteMembersManageSection badge derivation.
 *
 * 観点 / Coverage:
 *   - pending かつ有効期限内: 送信時刻・残り日数メタ付きの招待中バッジ
 *   - pending かつ有効期限切れ: 「期限切れ」バッジ（再送ボタンは引き続き有効）
 *   - accepted: 「参加済み」バッジ
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoteMembersManageSection } from "./NoteMembersManageSection";
import type { NoteMemberInvitation } from "@/types/note";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      const parts = Object.entries(opts)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(",");
      return `${key}(${parts})`;
    },
    i18n: { language: "ja" },
  }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

const NOW_MS = Date.parse("2026-04-20T12:00:00Z");

function makeInvitation(overrides: Partial<NoteMemberInvitation> = {}): NoteMemberInvitation {
  return {
    expiresAt: NOW_MS + 5 * 24 * 60 * 60 * 1000,
    lastEmailSentAt: NOW_MS - 3 * 60 * 60 * 1000,
    emailSendCount: 1,
    ...overrides,
  };
}

function renderSection(members: React.ComponentProps<typeof NoteMembersManageSection>["members"]) {
  return render(
    <NoteMembersManageSection
      members={members}
      isMembersLoading={false}
      memberEmail=""
      setMemberEmail={() => {}}
      memberRole="viewer"
      setMemberRole={() => {}}
      roleOptions={[
        { value: "viewer", label: "Viewer" },
        { value: "editor", label: "Editor" },
      ]}
      onAddMember={async () => {}}
      onUpdateRole={async () => {}}
      onRemoveMember={async () => {}}
      onResendInvitation={async () => {}}
      now={() => NOW_MS}
    />,
  );
}

describe("NoteMembersManageSection — badge derivation", () => {
  it("pending かつ期限内はメタ付き招待中バッジ + 再送ボタン有効", () => {
    renderSection([
      {
        memberEmail: "guest@example.com",
        role: "viewer",
        status: "pending",
        invitation: makeInvitation(),
      },
    ]);

    // メタ付き i18n キーが使われている
    const badge = screen.getByText(/^notes\.statusPendingWithMeta\(/);
    expect(badge.textContent).toContain("sent=notes.invitationSentHoursAgo(count=3)");
    expect(badge.textContent).toContain("remaining=notes.invitationRemainingDays(count=5)");

    // 再送ボタンは有効
    expect(
      screen.getByRole("button", {
        name: /notes\.a11yResendInvitation/,
      }),
    ).toBeInTheDocument();
  });

  it("pending かつ期限切れは『期限切れ』バッジ + 再送ボタン有効", () => {
    renderSection([
      {
        memberEmail: "guest@example.com",
        role: "viewer",
        status: "pending",
        invitation: makeInvitation({
          expiresAt: NOW_MS - 1000,
          lastEmailSentAt: NOW_MS - 8 * 24 * 60 * 60 * 1000,
        }),
      },
    ]);

    expect(screen.getByText("notes.statusExpired")).toBeInTheDocument();
    // 再送は引き続き可能（期限切れでも）
    expect(
      screen.getByRole("button", {
        name: /notes\.a11yResendInvitation/,
      }),
    ).toBeInTheDocument();
  });

  it("accepted は『参加済み』バッジを表示し再送ボタンは表示しない", () => {
    renderSection([
      {
        memberEmail: "guest@example.com",
        role: "editor",
        status: "accepted",
        invitation: null,
      },
    ]);

    expect(screen.getByText("notes.statusAccepted")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /notes\.a11yResendInvitation/,
      }),
    ).not.toBeInTheDocument();
  });

  it("invitation が null の pending メンバーはメタ無し招待中バッジ", () => {
    renderSection([
      {
        memberEmail: "guest@example.com",
        role: "viewer",
        status: "pending",
        invitation: null,
      },
    ]);

    expect(screen.getByText("notes.statusPending")).toBeInTheDocument();
  });
});
