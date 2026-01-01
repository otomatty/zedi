import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkedPagesSection } from "./LinkedPagesSection";
import { TestWrapper, createTestQueryClient } from "@/test/testWrapper";
import type { LinkedPagesData } from "@/hooks/useLinkedPages";

// Mock the hooks
const mockNavigate = vi.fn();
const mockCreatePage = vi.fn();
const mockLinkedPagesData: LinkedPagesData = {
  outgoingLinks: [],
  backlinks: [],
  twoHopLinks: [],
  ghostLinks: [],
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/useLinkedPages", () => ({
  useLinkedPages: vi.fn(() => ({
    data: mockLinkedPagesData,
    isLoading: false,
  })),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useCreatePage: () => ({
    mutateAsync: mockCreatePage,
  }),
}));

describe("LinkedPagesSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock data
    mockLinkedPagesData.outgoingLinks = [];
    mockLinkedPagesData.backlinks = [];
    mockLinkedPagesData.twoHopLinks = [];
    mockLinkedPagesData.ghostLinks = [];
  });

  const renderComponent = () => {
    const queryClient = createTestQueryClient();
    return render(
      <TestWrapper queryClient={queryClient}>
        <LinkedPagesSection pageId="test-page-id" />
      </TestWrapper>
    );
  };

  it("should render nothing when there are no links", () => {
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });

  it("should render outgoing links section", () => {
    mockLinkedPagesData.outgoingLinks = [
      {
        id: "page-1",
        title: "Outgoing Page",
        preview: "Preview text",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    expect(screen.getByText("リンク先 (1)")).toBeInTheDocument();
    expect(screen.getByText("Outgoing Page")).toBeInTheDocument();
  });

  it("should render backlinks section", () => {
    mockLinkedPagesData.backlinks = [
      {
        id: "backlink-1",
        title: "Backlink Page",
        preview: "Backlink preview",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    expect(screen.getByText("被リンク (1)")).toBeInTheDocument();
    expect(screen.getByText("Backlink Page")).toBeInTheDocument();
  });

  it("should render ghost links section", () => {
    mockLinkedPagesData.ghostLinks = ["Non Existing Page"];

    renderComponent();

    expect(screen.getByText("未作成のリンク (1)")).toBeInTheDocument();
    expect(screen.getByText("Non Existing Page")).toBeInTheDocument();
  });

  it("should render 2-hop links in collapsible section", () => {
    mockLinkedPagesData.twoHopLinks = [
      {
        id: "twohop-1",
        title: "Two Hop Page",
        preview: "Two hop preview",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    expect(screen.getByText("2階層先 (1)")).toBeInTheDocument();
  });

  it("should navigate to page when outgoing link is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.outgoingLinks = [
      {
        id: "target-page",
        title: "Target Page",
        preview: "Preview",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    await user.click(screen.getByText("Target Page"));

    expect(mockNavigate).toHaveBeenCalledWith("/page/target-page");
  });

  it("should navigate to page when backlink is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.backlinks = [
      {
        id: "source-page",
        title: "Source Page",
        preview: "Preview",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    await user.click(screen.getByText("Source Page"));

    expect(mockNavigate).toHaveBeenCalledWith("/page/source-page");
  });

  it("should create page and navigate when ghost link is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.ghostLinks = ["New Page Title"];
    mockCreatePage.mockResolvedValue({ id: "new-page-id" });

    renderComponent();

    await user.click(screen.getByText("New Page Title"));

    await waitFor(() => {
      expect(mockCreatePage).toHaveBeenCalledWith({ title: "New Page Title" });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/page/new-page-id");
    });
  });

  it("should render multiple sections when all link types exist", () => {
    mockLinkedPagesData.outgoingLinks = [
      { id: "out-1", title: "Outgoing", preview: "", updatedAt: Date.now() },
    ];
    mockLinkedPagesData.backlinks = [
      { id: "back-1", title: "Backlink", preview: "", updatedAt: Date.now() },
    ];
    mockLinkedPagesData.ghostLinks = ["Ghost"];
    mockLinkedPagesData.twoHopLinks = [
      { id: "hop-1", title: "TwoHop", preview: "", updatedAt: Date.now() },
    ];

    renderComponent();

    expect(screen.getByText("リンク先 (1)")).toBeInTheDocument();
    expect(screen.getByText("被リンク (1)")).toBeInTheDocument();
    expect(screen.getByText("未作成のリンク (1)")).toBeInTheDocument();
    expect(screen.getByText("2階層先 (1)")).toBeInTheDocument();
  });

  it("should expand 2-hop links when collapsible is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.twoHopLinks = [
      {
        id: "twohop-1",
        title: "Hidden Two Hop",
        preview: "Hidden content",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    // Initially the content might be hidden
    const trigger = screen.getByText("2階層先 (1)");
    await user.click(trigger);

    // After clicking, the content should be visible
    await waitFor(() => {
      expect(screen.getByText("Hidden Two Hop")).toBeInTheDocument();
    });
  });
});
