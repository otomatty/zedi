import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorRecommendationBarGenerating } from "./EditorRecommendationBarGenerating";

describe("EditorRecommendationBarGenerating", () => {
  it("shows loading message when isLoading", () => {
    render(
      <EditorRecommendationBarGenerating
        isLoading={true}
        errorMessage={null}
        onBackToActions={vi.fn()}
      />,
    );
    expect(screen.getByText("画像を生成中...")).toBeInTheDocument();
  });

  it("shows error message when errorMessage is set", () => {
    render(
      <EditorRecommendationBarGenerating
        isLoading={false}
        errorMessage="エラーが発生しました"
        onBackToActions={vi.fn()}
      />,
    );
    expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
  });

  it("shows 戻る button when not loading and no error", async () => {
    const onBackToActions = vi.fn();
    render(
      <EditorRecommendationBarGenerating
        isLoading={false}
        errorMessage={null}
        onBackToActions={onBackToActions}
      />,
    );
    expect(screen.getByRole("button", { name: "戻る" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "戻る" }));
    expect(onBackToActions).toHaveBeenCalledTimes(1);
  });
});
