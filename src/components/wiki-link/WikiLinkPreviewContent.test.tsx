import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { WikiLinkPreviewContent } from "./WikiLinkPreviewContent";
import type { Page } from "@/types/page";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

const createMockPage = (overrides?: Partial<Page>): Page => ({
  id: "page-1",
  ownerUserId: "user-1",
  noteId: null,
  title: "テストページ",
  content:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"これはテストのプレビューです"}]}]}',
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 3600000,
  isDeleted: false,
  ...overrides,
});

describe("WikiLinkPreviewContent", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
  });

  describe("existing page (exists=true)", () => {
    it("should render page title", () => {
      const page = createMockPage({ title: "My Page" });
      renderWithI18n(
        <WikiLinkPreviewContent title="My Page" page={page} exists={true} referenced={false} />,
      );
      expect(screen.getByText("My Page")).toBeInTheDocument();
    });

    it("should render content preview", () => {
      const page = createMockPage();
      renderWithI18n(
        <WikiLinkPreviewContent
          title="テストページ"
          page={page}
          exists={true}
          referenced={false}
        />,
      );
      expect(screen.getByText(/これはテストのプレビューです/)).toBeInTheDocument();
    });

    it("should render '無題のページ' for empty title", () => {
      const page = createMockPage({ title: "" });
      renderWithI18n(
        <WikiLinkPreviewContent title="" page={page} exists={true} referenced={false} />,
      );
      expect(screen.getByText("無題のページ")).toBeInTheDocument();
    });

    it("should render contentPreview if available", () => {
      const page = createMockPage({ contentPreview: "事前計算済みプレビュー" });
      renderWithI18n(
        <WikiLinkPreviewContent
          title="テストページ"
          page={page}
          exists={true}
          referenced={false}
        />,
      );
      expect(screen.getByText("事前計算済みプレビュー")).toBeInTheDocument();
    });

    it("should render relative time", () => {
      const page = createMockPage({ updatedAt: Date.now() - 3600000 });
      renderWithI18n(
        <WikiLinkPreviewContent
          title="テストページ"
          page={page}
          exists={true}
          referenced={false}
        />,
      );
      expect(screen.getByText("1時間前")).toBeInTheDocument();
    });

    it("should call onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const page = createMockPage();
      renderWithI18n(
        <WikiLinkPreviewContent
          title="テストページ"
          page={page}
          exists={true}
          referenced={false}
          onClick={handleClick}
        />,
      );
      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not render a focusable button when onClick is absent", () => {
      const page = createMockPage();
      renderWithI18n(
        <WikiLinkPreviewContent
          title="テストページ"
          page={page}
          exists={true}
          referenced={false}
        />,
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("ghost link (exists=false, referenced=false)", () => {
    it("should render title in muted style", () => {
      renderWithI18n(
        <WikiLinkPreviewContent
          title="新しいページ"
          page={undefined}
          exists={false}
          referenced={false}
        />,
      );
      expect(screen.getByText("新しいページ")).toBeInTheDocument();
    });

    it("should show ghost message", () => {
      renderWithI18n(
        <WikiLinkPreviewContent
          title="新しいページ"
          page={undefined}
          exists={false}
          referenced={false}
        />,
      );
      expect(screen.getByText("まだ作成されていないページです。")).toBeInTheDocument();
    });

    it("should show 'クリックして作成' prompt when onClick is provided", () => {
      renderWithI18n(
        <WikiLinkPreviewContent
          title="新しいページ"
          page={undefined}
          exists={false}
          referenced={false}
          onClick={() => {}}
        />,
      );
      expect(screen.getByText("クリックして作成")).toBeInTheDocument();
    });

    it("should not show 'クリックして作成' when onClick is absent", () => {
      renderWithI18n(
        <WikiLinkPreviewContent
          title="新しいページ"
          page={undefined}
          exists={false}
          referenced={false}
        />,
      );
      expect(screen.queryByText("クリックして作成")).not.toBeInTheDocument();
    });
  });

  describe("referenced ghost link (exists=false, referenced=true)", () => {
    it("should show referenced message", () => {
      renderWithI18n(
        <WikiLinkPreviewContent
          title="参照ページ"
          page={undefined}
          exists={false}
          referenced={true}
        />,
      );
      expect(
        screen.getByText("まだ作成されていないページです。他のページからも参照されています。"),
      ).toBeInTheDocument();
    });

    it("should call onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      renderWithI18n(
        <WikiLinkPreviewContent
          title="参照ページ"
          page={undefined}
          exists={false}
          referenced={true}
          onClick={handleClick}
        />,
      );
      await user.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
