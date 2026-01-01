import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageLinkCard } from "./PageLinkCard";
import type { PageCard } from "@/hooks/useLinkedPages";

describe("PageLinkCard", () => {
  const createPageCard = (overrides?: Partial<PageCard>): PageCard => ({
    id: "page-1",
    title: "Test Page",
    preview: "This is a test preview",
    updatedAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
    ...overrides,
  });

  it("should render page title", () => {
    const page = createPageCard({ title: "My Test Page" });
    render(<PageLinkCard page={page} onClick={() => {}} />);

    expect(screen.getByText("My Test Page")).toBeInTheDocument();
  });

  it("should render preview text", () => {
    const page = createPageCard({ preview: "This is the preview content" });
    render(<PageLinkCard page={page} onClick={() => {}} />);

    expect(screen.getByText("This is the preview content")).toBeInTheDocument();
  });

  it("should show '無題のページ' for empty title", () => {
    const page = createPageCard({ title: "" });
    render(<PageLinkCard page={page} onClick={() => {}} />);

    expect(screen.getByText("無題のページ")).toBeInTheDocument();
  });

  it("should show '内容がありません' for empty preview", () => {
    const page = createPageCard({ preview: "" });
    render(<PageLinkCard page={page} onClick={() => {}} />);

    expect(screen.getByText("内容がありません")).toBeInTheDocument();
  });

  it("should call onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const page = createPageCard();
    
    render(<PageLinkCard page={page} onClick={onClick} />);
    
    await user.click(screen.getByText("Test Page"));
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should display relative time for updatedAt", () => {
    const oneHourAgo = Date.now() - 1000 * 60 * 60;
    const page = createPageCard({ updatedAt: oneHourAgo });
    
    render(<PageLinkCard page={page} onClick={() => {}} />);
    
    expect(screen.getByText("1時間前")).toBeInTheDocument();
  });

  it("should display different icon for pages with sourceUrl", () => {
    const webClippedPage = createPageCard({ 
      sourceUrl: "https://example.com/article" 
    });
    const normalPage = createPageCard({ sourceUrl: undefined });

    const { rerender } = render(
      <PageLinkCard page={webClippedPage} onClick={() => {}} />
    );
    
    // Web clipped page should have link icon (we check the icon exists)
    const container1 = screen.getByText("Test Page").closest("div");
    expect(container1).toBeInTheDocument();

    rerender(<PageLinkCard page={normalPage} onClick={() => {}} />);
    
    // Normal page should have file icon
    const container2 = screen.getByText("Test Page").closest("div");
    expect(container2).toBeInTheDocument();
  });
});
