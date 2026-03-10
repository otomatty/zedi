import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorRecommendationBarHeader } from "./EditorRecommendationBarHeader";

const editorRecommendation: Record<string, string> = {
  next: "次へ",
  back: "戻る",
  close: "閉じる",
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key.startsWith("editor.recommendation.")) {
        const sub = key.replace("editor.recommendation.", "");
        return editorRecommendation[sub] ?? key;
      }
      return key;
    },
    i18n: { language: "ja" },
  }),
}));

describe("EditorRecommendationBarHeader", () => {
  const defaultProps = {
    headerLabel: "おすすめ",
    mode: "actions" as const,
    nextCursor: null as string | null,
    isLoading: false,
    onNextPage: vi.fn(),
    onBackToActions: vi.fn(),
    onDismiss: vi.fn(),
  };

  it("renders header label", () => {
    render(<EditorRecommendationBarHeader {...defaultProps} />);
    expect(screen.getByText("おすすめ")).toBeInTheDocument();
  });

  it("shows 次へ and 戻る when mode is thumbnails", () => {
    render(
      <EditorRecommendationBarHeader {...defaultProps} mode="thumbnails" nextCursor="cursor1" />,
    );
    expect(screen.getByRole("button", { name: "次へ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "戻る" })).toBeInTheDocument();
  });

  it("disables 次へ when nextCursor is null or isLoading", () => {
    const { rerender } = render(
      <EditorRecommendationBarHeader {...defaultProps} mode="thumbnails" nextCursor={null} />,
    );
    expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();

    rerender(
      <EditorRecommendationBarHeader
        {...defaultProps}
        mode="thumbnails"
        nextCursor="c"
        isLoading={true}
      />,
    );
    expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();
  });

  it("calls onDismiss when 閉じる is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<EditorRecommendationBarHeader {...defaultProps} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onBackToActions when 戻る is clicked", async () => {
    const user = userEvent.setup();
    const onBackToActions = vi.fn();
    render(
      <EditorRecommendationBarHeader
        {...defaultProps}
        mode="thumbnails"
        nextCursor="c"
        onBackToActions={onBackToActions}
      />,
    );
    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect(onBackToActions).toHaveBeenCalledTimes(1);
  });
});
