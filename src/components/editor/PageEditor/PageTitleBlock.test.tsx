import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageTitleBlock } from "./PageTitleBlock";

describe("PageTitleBlock", () => {
  describe("編集モード", () => {
    it("プレースホルダー「タイトル」が表示される", () => {
      render(
        <PageTitleBlock title="" onTitleChange={vi.fn()} />
      );
      expect(screen.getByPlaceholderText("タイトル")).toBeInTheDocument();
    });

    it("テキストを変更すると onTitleChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onTitleChange = vi.fn();
      render(
        <PageTitleBlock title="" onTitleChange={onTitleChange} />
      );
      const input = screen.getByPlaceholderText("タイトル");
      await user.type(input, "新しいタイトル");
      expect(onTitleChange).toHaveBeenCalled();
    });

    it("errorMessage があるときエラー表示と text-destructive が付く", () => {
      const { container } = render(
        <PageTitleBlock
          title="タイトル"
          onTitleChange={vi.fn()}
          errorMessage="重複しています"
        />
      );
      const input = container.querySelector("input");
      expect(input).toHaveClass("text-destructive");
      expect(screen.getByRole("alert")).toHaveTextContent("重複しています");
    });

    it("errorMessage が null のとき text-destructive を付けない", () => {
      const { container } = render(
        <PageTitleBlock title="タイトル" onTitleChange={vi.fn()} />
      );
      const input = container.querySelector("input");
      expect(input).not.toHaveClass("text-destructive");
    });

    it("Enter キー（変換確定後）で onEnterMoveToContent が呼ばれる", async () => {
      const user = userEvent.setup();
      const onEnterMoveToContent = vi.fn();
      render(
        <PageTitleBlock
          title="タイトル"
          onTitleChange={vi.fn()}
          onEnterMoveToContent={onEnterMoveToContent}
        />
      );
      const input = screen.getByPlaceholderText("タイトル");
      await user.click(input);
      await user.keyboard("{Enter}");
      expect(onEnterMoveToContent).toHaveBeenCalledTimes(1);
    });
  });

  describe("閲覧モード", () => {
    it("isReadOnly のとき入力欄がなくタイトルテキストが表示される", () => {
      render(
        <PageTitleBlock title="閲覧用タイトル" isReadOnly />
      );
      expect(screen.queryByPlaceholderText("タイトル")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "閲覧用タイトル"
      );
    });

    it("タイトルが空のとき「無題のページ」を表示する", () => {
      render(<PageTitleBlock title="" isReadOnly />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "無題のページ"
      );
    });
  });

  describe("titleRef", () => {
    it("titleRef を渡すとルート要素に ref が付与される", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <PageTitleBlock title="テスト" isReadOnly titleRef={ref} />
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.textContent).toContain("テスト");
    });
  });
});
