import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorRecommendationBarThumbnails } from "./EditorRecommendationBarThumbnails";
import type { ThumbnailCandidate } from "./EditorRecommendationBarTypes";

const createRef = () => React.createRef<HTMLDivElement | null>();

describe("EditorRecommendationBarThumbnails", () => {
  const defaultProps = {
    candidates: [] as ThumbnailCandidate[],
    isLoading: false,
    errorMessage: null as string | null,
    scrollRef: createRef(),
    onWheel: vi.fn(),
    onSelectCandidate: vi.fn(),
  };

  it("shows loading message when isLoading", () => {
    render(<EditorRecommendationBarThumbnails {...defaultProps} isLoading={true} />);
    expect(screen.getByText("画像を検索中...")).toBeInTheDocument();
  });

  it("shows error message when errorMessage is set", () => {
    render(
      <EditorRecommendationBarThumbnails {...defaultProps} errorMessage="検索に失敗しました" />,
    );
    expect(screen.getByText("検索に失敗しました")).toBeInTheDocument();
  });

  it("shows empty state when no candidates", () => {
    render(<EditorRecommendationBarThumbnails {...defaultProps} />);
    expect(screen.getByText("候補が見つかりませんでした")).toBeInTheDocument();
  });

  it("renders candidates and calls onSelectCandidate when one is clicked", async () => {
    const user = userEvent.setup();
    const onSelectCandidate = vi.fn();
    const candidates: ThumbnailCandidate[] = [
      {
        id: "1",
        previewUrl: "https://example.com/p.jpg",
        imageUrl: "https://example.com/full.jpg",
        alt: "Test alt",
        sourceName: "Source",
        sourceUrl: "https://example.com/source",
      },
    ];
    render(
      <EditorRecommendationBarThumbnails
        {...defaultProps}
        candidates={candidates}
        onSelectCandidate={onSelectCandidate}
      />,
    );
    expect(screen.getByAltText("Test alt")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    await user.click(screen.getByAltText("Test alt"));
    expect(onSelectCandidate).toHaveBeenCalledWith(candidates[0]);
  });

  it("renders author name as link when authorUrl is set", () => {
    const candidates: ThumbnailCandidate[] = [
      {
        id: "1",
        previewUrl: "https://p",
        imageUrl: "https://img",
        alt: "Alt",
        sourceName: "Source",
        sourceUrl: "https://s",
        authorName: "Author",
        authorUrl: "https://author.com",
      },
    ];
    render(<EditorRecommendationBarThumbnails {...defaultProps} candidates={candidates} />);
    const authorLink = screen.getByRole("link", { name: "Author" });
    expect(authorLink).toBeInTheDocument();
    expect(authorLink).toHaveAttribute("href", "https://author.com");
  });

  it("renders author name as span when authorUrl is not set", () => {
    const candidates: ThumbnailCandidate[] = [
      {
        id: "1",
        previewUrl: "https://p",
        imageUrl: "https://img",
        alt: "Alt",
        sourceName: "Source",
        sourceUrl: "https://s",
        authorName: "Author Only",
      },
    ];
    render(<EditorRecommendationBarThumbnails {...defaultProps} candidates={candidates} />);
    expect(screen.getByText("Author Only")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Author Only" })).not.toBeInTheDocument();
  });
});
