import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth } from "@/hooks/useAuth";
import { EditorRecommendationBar } from "./EditorRecommendationBar";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const defaultProps = {
  pageTitle: "Test Page",
  isReadOnly: false,
  hasThumbnail: false,
  onSelectThumbnail: vi.fn(),
};

describe("EditorRecommendationBar", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isSignedIn: true,
    } as never);
    vi.clearAllMocks();
  });

  it("renders nothing when isReadOnly is true", () => {
    const { container } = render(<EditorRecommendationBar {...defaultProps} isReadOnly={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when hasThumbnail is true", () => {
    const { container } = render(<EditorRecommendationBar {...defaultProps} hasThumbnail={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders bar with おすすめ and action buttons when canSearch", () => {
    render(<EditorRecommendationBar {...defaultProps} />);
    expect(screen.getByText("おすすめ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画像を検索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AIで生成/ })).toBeInTheDocument();
    expect(screen.getByText("タイトルから画像を検索または生成します")).toBeInTheDocument();
  });

  it("hides bar when close button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<EditorRecommendationBar {...defaultProps} />);
    expect(screen.getByText("おすすめ")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByText("おすすめ")).not.toBeInTheDocument();
    expect(container.querySelector(".fixed.bottom-0")).not.toBeInTheDocument();
  });

  it("shows 画像を検索 and 戻る after opening thumbnail picker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [], nextCursor: null }),
      }),
    );
    const user = userEvent.setup();
    render(<EditorRecommendationBar {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "画像を検索" }));

    expect(screen.getByText("サムネイル候補")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "戻る" })).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("calls onSelectThumbnail when a candidate is selected", async () => {
    const user = userEvent.setup();
    const onSelectThumbnail = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "1",
              previewUrl: "https://example.com/preview.jpg",
              imageUrl: "https://example.com/full.jpg",
              alt: "Alt",
              sourceName: "Source",
              sourceUrl: "https://example.com",
            },
          ],
          nextCursor: null,
        }),
      }),
    );

    render(<EditorRecommendationBar {...defaultProps} onSelectThumbnail={onSelectThumbnail} />);
    await user.click(screen.getByRole("button", { name: "画像を検索" }));

    await screen.findByText("Source");

    await user.click(screen.getByAltText("Alt"));

    expect(onSelectThumbnail).toHaveBeenCalledWith(
      "https://example.com/full.jpg",
      "Alt",
      "https://example.com/preview.jpg",
    );

    vi.unstubAllGlobals();
  });
});
