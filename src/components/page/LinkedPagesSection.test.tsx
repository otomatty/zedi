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
  outgoingLinksWithChildren: [],
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
    mockLinkedPagesData.outgoingLinksWithChildren = [];
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

  it("should render combined links section with outgoing and backlinks", () => {
    mockLinkedPagesData.outgoingLinks = [
      {
        id: "page-1",
        title: "Outgoing Page",
        preview: "Preview text",
        updatedAt: Date.now(),
      },
    ];
    mockLinkedPagesData.backlinks = [
      {
        id: "backlink-1",
        title: "Backlink Page",
        preview: "Backlink preview",
        updatedAt: Date.now(),
      },
    ];

    renderComponent();

    // Should show combined "リンク" section with count 2
    expect(screen.getByText("リンク (2)")).toBeInTheDocument();
    expect(screen.getByText("Outgoing Page")).toBeInTheDocument();
    expect(screen.getByText("Backlink Page")).toBeInTheDocument();
  });

  it("should render ghost links section with new label", () => {
    mockLinkedPagesData.ghostLinks = ["Non Existing Page"];

    renderComponent();

    expect(screen.getByText("新しいリンク (1)")).toBeInTheDocument();
    expect(screen.getByText("Non Existing Page")).toBeInTheDocument();
  });

  it("should render outgoing links with children in horizontal layout", () => {
    mockLinkedPagesData.outgoingLinksWithChildren = [
      {
        source: {
          id: "source-page",
          title: "Source Page",
          preview: "Source preview",
          updatedAt: Date.now(),
        },
        children: [
          {
            id: "child-1",
            title: "Child Page 1",
            preview: "Child preview",
            updatedAt: Date.now(),
          },
          {
            id: "child-2",
            title: "Child Page 2",
            preview: "Child preview 2",
            updatedAt: Date.now(),
          },
        ],
      },
    ];

    renderComponent();

    expect(screen.getByText("Source Page")).toBeInTheDocument();
    expect(screen.getByText("Child Page 1")).toBeInTheDocument();
    expect(screen.getByText("Child Page 2")).toBeInTheDocument();
  });

  it("should navigate to page when link is clicked", async () => {
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

  it("should navigate to source page when link group source is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.outgoingLinksWithChildren = [
      {
        source: {
          id: "source-page",
          title: "Source Page",
          preview: "Source preview",
          updatedAt: Date.now(),
        },
        children: [
          {
            id: "child-1",
            title: "Child Page",
            preview: "Child preview",
            updatedAt: Date.now(),
          },
        ],
      },
    ];

    renderComponent();

    await user.click(screen.getByText("Source Page"));

    expect(mockNavigate).toHaveBeenCalledWith("/page/source-page");
  });

  it("should navigate to child page when child card is clicked", async () => {
    const user = userEvent.setup();
    mockLinkedPagesData.outgoingLinksWithChildren = [
      {
        source: {
          id: "source-page",
          title: "Source Page",
          preview: "Source preview",
          updatedAt: Date.now(),
        },
        children: [
          {
            id: "child-page",
            title: "Child Page",
            preview: "Child preview",
            updatedAt: Date.now(),
          },
        ],
      },
    ];

    renderComponent();

    await user.click(screen.getByText("Child Page"));

    expect(mockNavigate).toHaveBeenCalledWith("/page/child-page");
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

  it("should render all sections when all link types exist", () => {
    mockLinkedPagesData.outgoingLinks = [
      { id: "out-1", title: "Outgoing", preview: "", updatedAt: Date.now() },
    ];
    mockLinkedPagesData.backlinks = [
      { id: "back-1", title: "Backlink", preview: "", updatedAt: Date.now() },
    ];
    mockLinkedPagesData.outgoingLinksWithChildren = [
      {
        source: {
          id: "source-1",
          title: "SourceWithChildren",
          preview: "",
          updatedAt: Date.now(),
        },
        children: [
          {
            id: "child-1",
            title: "ChildPage",
            preview: "",
            updatedAt: Date.now(),
          },
        ],
      },
    ];
    mockLinkedPagesData.ghostLinks = ["Ghost"];

    renderComponent();

    // Combined links section
    expect(screen.getByText("リンク (2)")).toBeInTheDocument();
    // Link group row
    expect(screen.getByText("SourceWithChildren")).toBeInTheDocument();
    expect(screen.getByText("ChildPage")).toBeInTheDocument();
    // Ghost links renamed
    expect(screen.getByText("新しいリンク (1)")).toBeInTheDocument();
  });
});
