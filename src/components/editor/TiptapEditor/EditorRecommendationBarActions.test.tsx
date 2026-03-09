import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorRecommendationBarActions } from "./EditorRecommendationBarActions";

describe("EditorRecommendationBarActions", () => {
  it("renders 画像を検索 and AIで生成 buttons and description", () => {
    render(
      <EditorRecommendationBarActions
        onOpenThumbnailPicker={vi.fn()}
        onGenerateImage={vi.fn()}
        isLoading={false}
      />,
    );
    expect(screen.getByRole("button", { name: "画像を検索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AIで生成/ })).toBeInTheDocument();
    expect(screen.getByText("タイトルから画像を検索または生成します")).toBeInTheDocument();
  });

  it("calls onOpenThumbnailPicker when 画像を検索 is clicked", async () => {
    const user = userEvent.setup();
    const onOpenThumbnailPicker = vi.fn();
    render(
      <EditorRecommendationBarActions
        onOpenThumbnailPicker={onOpenThumbnailPicker}
        onGenerateImage={vi.fn()}
        isLoading={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "画像を検索" }));
    expect(onOpenThumbnailPicker).toHaveBeenCalledTimes(1);
  });

  it("calls onGenerateImage when AIで生成 is clicked", async () => {
    const user = userEvent.setup();
    const onGenerateImage = vi.fn();
    render(
      <EditorRecommendationBarActions
        onOpenThumbnailPicker={vi.fn()}
        onGenerateImage={onGenerateImage}
        isLoading={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /AIで生成/ }));
    expect(onGenerateImage).toHaveBeenCalledTimes(1);
  });

  it("disables AIで生成 button when isLoading", () => {
    render(
      <EditorRecommendationBarActions
        onOpenThumbnailPicker={vi.fn()}
        onGenerateImage={vi.fn()}
        isLoading={true}
      />,
    );
    expect(screen.getByRole("button", { name: /AIで生成/ })).toBeDisabled();
  });
});
