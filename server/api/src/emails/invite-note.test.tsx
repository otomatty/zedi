/**
 * ノート招待メールテンプレートのテスト
 * Tests for note invitation email template
 */
import { describe, it, expect } from "vitest";
import {
  renderInviteNoteEmail,
  getInviteNoteSubject,
  type InviteNoteEmailProps,
} from "./invite-note.js";

const baseProps: InviteNoteEmailProps = {
  noteTitle: "テストノート",
  inviterName: "田中太郎",
  role: "editor",
  inviteUrl: "https://zedi-note.app/invite?token=abc123",
  locale: "ja",
};

describe("renderInviteNoteEmail", () => {
  it("日本語テンプレートが正しくレンダリングされる", async () => {
    const html = await renderInviteNoteEmail(baseProps);

    expect(html).toContain("ノートへの招待");
    expect(html).toContain("テストノート");
    expect(html).toContain("田中太郎");
    expect(html).toContain("編集者");
    expect(html).toContain("ノートを開く");
    expect(html).toContain("https://zedi-note.app/invite?token=abc123");
    expect(html).toContain("7 日間");
  });

  it("英語テンプレートが正しくレンダリングされる", async () => {
    const html = await renderInviteNoteEmail({ ...baseProps, locale: "en" });

    expect(html).toContain("Note Invitation");
    expect(html).toContain("テストノート");
    expect(html).toContain("田中太郎");
    expect(html).toContain("Editor");
    expect(html).toContain("Open Note");
    expect(html).toContain("https://zedi-note.app/invite?token=abc123");
    expect(html).toContain("7 days");
  });

  it("viewer ロールが正しく表示される", async () => {
    const html = await renderInviteNoteEmail({ ...baseProps, role: "viewer" });
    expect(html).toContain("閲覧者");

    const htmlEn = await renderInviteNoteEmail({
      ...baseProps,
      role: "viewer",
      locale: "en",
    });
    expect(htmlEn).toContain("Viewer");
  });

  it("未知のロールはそのまま表示される", async () => {
    const html = await renderInviteNoteEmail({ ...baseProps, role: "admin" });
    expect(html).toContain("admin");
  });

  it("locale 未指定時は日本語がデフォルト", async () => {
    const { locale: _, ...propsWithoutLocale } = baseProps;
    const html = await renderInviteNoteEmail(propsWithoutLocale);
    expect(html).toContain("ノートへの招待");
  });

  it("有効な HTML が返される", async () => {
    const html = await renderInviteNoteEmail(baseProps);
    expect(html).toMatch(/^<!DOCTYPE html/i);
    expect(html).toContain("</html>");
  });
});

describe("getInviteNoteSubject", () => {
  it("日本語の件名を返す", () => {
    const subject = getInviteNoteSubject({
      inviterName: "田中太郎",
      noteTitle: "テストノート",
      locale: "ja",
    });
    expect(subject).toBe("[Zedi] 田中太郎 さんがノート「テストノート」にあなたを招待しました");
  });

  it("英語の件名を返す", () => {
    const subject = getInviteNoteSubject({
      inviterName: "John",
      noteTitle: "My Note",
      locale: "en",
    });
    expect(subject).toBe("[Zedi] John invited you to the note 'My Note'");
  });

  it("locale 未指定時は日本語がデフォルト", () => {
    const subject = getInviteNoteSubject({
      inviterName: "田中太郎",
      noteTitle: "テストノート",
    });
    expect(subject).toContain("さんがノート");
  });
});
