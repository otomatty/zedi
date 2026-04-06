import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WikiLinkPreviewContent } from "./WikiLinkPreviewContent";
import type { Page } from "@/types/page";

const createMockPage = (overrides?: Partial<Page>): Page => ({
  id: "page-1",
  ownerUserId: "user-1",
  title: "テストページ",
  content:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"これはテストのプレビューです"}]}]}',
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 3600000,
  isDeleted: false,
  ...overrides,
});

describe("WikiLinkPreviewContent", () => {
  describe("existing page (exists=true)", () => {
    it("should render page title", () => {
      const page = createMockPage({ title: "My Page" });
      render(
        <WikiLinkPreviewContent title="My Page" page={page} exists={true} referenced={false} />,
      );
      expect(screen.getByText("My Page")).toBeInTheDocument();
    });

    it("should render content preview", () => {
      const page = createMockPage();
      render(
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
      render(<WikiLinkPreviewContent title="" page={page} exists={true} referenced={false} />);
      expect(screen.getByText("無題のページ")).toBeInTheDocument();
    });

    it("should render contentPreview if available", () => {
      const page = createMockPage({ contentPreview: "事前計算済みプレビュー" });
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
      render(
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
