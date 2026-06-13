/**
 * WikiComposePage: route wiring, header actions, session error retry, layout direction.
 * WikiComposePage: ルート配線、ヘッダー操作、セッションエラー再試行、レイアウト方向。
 */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WikiComposePage from "./WikiComposePage";
import { useWikiComposeSession } from "@/hooks/wiki/useWikiComposeSession";
import { useIsMobile } from "@zedi/ui";
import { COMPOSE_SEED_STATE_KEY } from "@/lib/wikiCompose/navigation";
import { INITIAL_WIKI_COMPOSE_SESSION_STATE } from "@/lib/wikiCompose/wikiComposeSessionReducer";

const { mockNavigate, mockUseParams, mockUseLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseParams: vi.fn(),
  mockUseLocation: vi.fn(),
}));

const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockSubmitBrief = vi.fn().mockResolvedValue(undefined);
const mockSubmitResearchApproval = vi.fn().mockResolvedValue(undefined);
const mockSubmitOutline = vi.fn().mockResolvedValue(undefined);
const mockSubmitConflictAck = vi.fn().mockResolvedValue(undefined);

function createMockSession(
  overrides: Partial<ReturnType<typeof useWikiComposeSession>> = {},
): ReturnType<typeof useWikiComposeSession> {
  return {
    ...INITIAL_WIKI_COMPOSE_SESSION_STATE,
    completedMarkdown: null,
    start: mockStart,
    submitBrief: mockSubmitBrief,
    submitResearchApproval: mockSubmitResearchApproval,
    submitOutline: mockSubmitOutline,
    submitConflictAck: mockSubmitConflictAck,
    cancel: mockCancel,
    canRetryStart: false,
    ...overrides,
  };
}

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
    useLocation: () => mockUseLocation(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (typeof fallback === "string") return fallback;
      return key;
    },
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));

vi.mock("@/hooks/wiki/useWikiComposeSession", () => ({
  useWikiComposeSession: vi.fn(() => createMockSession()),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useIsMobile: vi.fn(() => false),
    ResizablePanelGroup: ({
      direction,
      children,
      className,
    }: {
      direction?: "horizontal" | "vertical";
      children?: React.ReactNode;
      className?: string;
    }) => (
      <div data-testid="resizable-panel-group" data-direction={direction} className={className}>
        {children}
      </div>
    ),
    ResizablePanel: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="resizable-panel">{children}</div>
    ),
    ResizableHandle: () => <div data-testid="resizable-handle" />,
  };
});

const paneMountCounts = vi.hoisted(() => ({ editor: 0, compose: 0 }));

function CountingPane({
  pane,
  testId,
  label,
}: {
  pane: "editor" | "compose";
  testId: string;
  label: string;
}) {
  React.useEffect(() => {
    paneMountCounts[pane] += 1;
  }, [pane]);
  return <div data-testid={testId}>{label}</div>;
}

vi.mock("@/components/wikiCompose/EditorPane", () => ({
  EditorPane: () => <CountingPane pane="editor" testId="editor-pane" label="EditorPane" />,
}));

vi.mock("@/components/wikiCompose/ComposePanel", () => ({
  ComposePanel: () => <CountingPane pane="compose" testId="compose-panel" label="ComposePanel" />,
}));

function WikiComposeHarness({ isMobile }: { isMobile: boolean }) {
  vi.mocked(useIsMobile).mockReturnValue(isMobile);
  return <WikiComposePage />;
}

function MobileFlipHarness() {
  const [isMobile, setIsMobile] = useState(true);
  vi.mocked(useIsMobile).mockReturnValue(isMobile);
  return (
    <>
      <button type="button" data-testid="flip-mobile" onClick={() => setIsMobile(false)}>
        desktop
      </button>
      <WikiComposePage />
    </>
  );
}

function renderWikiCompose(initialPath = "/notes/note-1/page-1/compose", isMobile = false) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/notes/:noteId/:pageId/compose/:sessionId?"
          element={<WikiComposeHarness isMobile={isMobile} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WikiComposePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paneMountCounts.editor = 0;
    paneMountCounts.compose = 0;
    mockUseParams.mockReturnValue({
      noteId: "note-1",
      pageId: "page-1",
      sessionId: undefined,
    });
    mockUseLocation.mockReturnValue({
      pathname: "/notes/note-1/page-1/compose",
      search: "",
      hash: "",
      state: null,
    });
    vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession());
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  describe("missing pageId", () => {
    it("shows destructive alert without header when pageId is missing", () => {
      mockUseParams.mockReturnValue({
        noteId: "note-1",
        pageId: "",
        sessionId: undefined,
      });

      renderWikiCompose("/notes/note-1/page-1/compose");

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("wikiCompose.page.missingPageIdTitle")).toBeInTheDocument();
      expect(screen.getByText("wikiCompose.page.missingPageIdDescription")).toBeInTheDocument();
      expect(screen.queryByTestId("compose-header")).not.toBeInTheDocument();
    });
  });

  describe("normal UI", () => {
    it("renders header with back and cancel controls", () => {
      renderWikiCompose();

      expect(screen.getByTestId("compose-header")).toBeInTheDocument();
      expect(screen.getByTestId("compose-back")).toBeInTheDocument();
      expect(screen.getByTestId("compose-cancel")).toBeInTheDocument();
      expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
      expect(screen.getByTestId("compose-panel")).toBeInTheDocument();
    });

    it("shows page snapshot title in the header when available", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(
        createMockSession({
          pageSnapshot: {
            pageId: "page-1",
            title: "Architecture Notes",
            body: "",
            hasContent: false,
          },
        }),
      );

      renderWikiCompose();

      expect(screen.getByText("Architecture Notes")).toBeInTheDocument();
    });

    it("shows fallback title in the header when page snapshot is missing", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ pageSnapshot: null }));

      renderWikiCompose();

      expect(screen.getByText("wikiCompose.page.titleFallback")).toBeInTheDocument();
    });

    it("shows raw phase text when the translation key is unresolved", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "brief" }));

      renderWikiCompose();

      expect(screen.getByText("brief")).toBeInTheDocument();
    });
  });

  describe("back navigation", () => {
    it("navigates to the note page when noteId and pageId are present", () => {
      renderWikiCompose();

      fireEvent.click(screen.getByRole("button", { name: "wikiCompose.page.back" }));

      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1/page-1");
    });

    it("navigates back one step when noteId or pageId is missing", () => {
      mockUseParams.mockReturnValue({
        noteId: "",
        pageId: "page-1",
        sessionId: undefined,
      });

      renderWikiCompose();

      fireEvent.click(screen.getByRole("button", { name: "wikiCompose.page.back" }));

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe("cancel action", () => {
    it("calls session.cancel then navigates to the note page", async () => {
      renderWikiCompose();

      fireEvent.click(screen.getByRole("button", { name: "wikiCompose.page.cancel" }));

      await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(1));
      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1/page-1");
    });
  });

  describe("session terminal status", () => {
    it("disables cancel and shows close label when session is completed", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ status: "completed" }));

      renderWikiCompose();

      const cancelButton = screen.getByRole("button", { name: "wikiCompose.page.close" });
      expect(cancelButton).toBeDisabled();
    });

    it("disables cancel and keeps cancel label when session is cancelled", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ status: "cancelled" }));

      renderWikiCompose();

      const cancelButton = screen.getByRole("button", { name: "wikiCompose.page.cancel" });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe("session error", () => {
    it("shows error banner and retry button that calls session.start", async () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(
        createMockSession({
          error: "network failed",
          canRetryStart: true,
        }),
      );

      renderWikiCompose();

      expect(screen.getByText("network failed")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("compose-retry"));

      await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    });

    it("does not show retry button when canRetryStart is false", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(
        createMockSession({
          error: "network failed",
          canRetryStart: false,
        }),
      );

      renderWikiCompose();

      expect(screen.getByText("network failed")).toBeInTheDocument();
      expect(screen.queryByTestId("compose-retry")).not.toBeInTheDocument();
    });
  });

  describe("session id display", () => {
    it("shows session prefix with first 8 characters of session id", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(
        createMockSession({
          session: {
            id: "abcdef12-rest-of-id",
            pageId: "page-1",
            userId: "user-1",
            graphId: "wiki-compose",
            backend: "zedi_managed",
            phase: "brief",
            status: "pending",
            metadata: null,
            lastError: null,
            closedAt: null,
            createdAt: "2026-05-24T00:00:00Z",
            updatedAt: "2026-05-24T00:00:00Z",
          },
        }),
      );

      renderWikiCompose();

      expect(screen.getByText("wikiCompose.page.sessionPrefix abcdef12…")).toBeInTheDocument();
    });
  });

  describe("layout direction", () => {
    it("shows both panes and no mobile tabs on desktop", () => {
      vi.mocked(useIsMobile).mockReturnValue(false);

      renderWikiCompose();

      expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
      expect(screen.getByTestId("compose-panel")).toBeInTheDocument();
      expect(screen.getByTestId("compose-mobile-tabs")).toHaveClass("hidden");
    });

    it("shows pane tabs on mobile", () => {
      renderWikiCompose("/notes/note-1/page-1/compose", true);

      expect(screen.getByTestId("compose-mobile-tabs")).toBeInTheDocument();
    });

    it("does not remount panes when the mobile breakpoint flips", () => {
      render(
        <MemoryRouter initialEntries={["/notes/note-1/page-1/compose"]}>
          <Routes>
            <Route
              path="/notes/:noteId/:pageId/compose/:sessionId?"
              element={<MobileFlipHarness />}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(paneMountCounts.editor).toBe(1);
      expect(paneMountCounts.compose).toBe(1);

      fireEvent.click(screen.getByTestId("flip-mobile"));

      expect(paneMountCounts.editor).toBe(1);
      expect(paneMountCounts.compose).toBe(1);
      expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
      expect(screen.getByTestId("compose-panel")).toBeInTheDocument();
      expect(screen.getByTestId("compose-mobile-tabs")).toHaveClass("hidden");
    });
  });

  describe("mobile pane tabs", () => {
    it("defaults to the compose pane during interrupt phases", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "brief" }));

      renderWikiCompose("/notes/note-1/page-1/compose", true);

      expect(screen.getByTestId("compose-tab-compose")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("compose-tab-preview")).toHaveAttribute("aria-selected", "false");
    });

    it("defaults to the preview pane while drafting", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "draft" }));

      renderWikiCompose("/notes/note-1/page-1/compose", true);

      expect(screen.getByTestId("compose-tab-preview")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("compose-tab-compose")).toHaveAttribute("aria-selected", "false");
    });

    it("switches the active pane when a tab is clicked", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "brief" }));

      renderWikiCompose("/notes/note-1/page-1/compose", true);

      fireEvent.click(screen.getByTestId("compose-tab-preview"));

      expect(screen.getByTestId("compose-tab-preview")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("compose-tab-compose")).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("session URL sync", () => {
    it("replaces URL with session id when session appears without sessionId in route", async () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(
        createMockSession({
          session: {
            id: "sess-abcd-1234",
            pageId: "page-1",
            userId: "user-1",
            graphId: "wiki-compose",
            backend: "zedi_managed",
            phase: "brief",
            status: "pending",
            metadata: null,
            lastError: null,
            closedAt: null,
            createdAt: "2026-05-24T00:00:00Z",
            updatedAt: "2026-05-24T00:00:00Z",
          },
        }),
      );

      renderWikiCompose();

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1/page-1/compose/sess-abcd-1234", {
          replace: true,
        }),
      );
    });
  });

  describe("compose seed state", () => {
    it("clears location.state when session status leaves idle or pending", async () => {
      const composeSeed = {
        outline: "Outline from chat",
        conversationText: "User asked about wiki",
      };
      mockUseLocation.mockReturnValue({
        pathname: "/notes/note-1/page-1/compose",
        search: "",
        hash: "",
        state: { [COMPOSE_SEED_STATE_KEY]: composeSeed },
      });
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ status: "running" }));

      renderWikiCompose();

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1/page-1/compose", {
          replace: true,
          state: null,
        }),
      );
    });

    it("does not clear location.state while session is still idle", () => {
      const composeSeed = {
        outline: "Outline from chat",
        conversationText: "User asked about wiki",
      };
      mockUseLocation.mockReturnValue({
        pathname: "/notes/note-1/page-1/compose",
        search: "",
        hash: "",
        state: { [COMPOSE_SEED_STATE_KEY]: composeSeed },
      });
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ status: "idle" }));

      renderWikiCompose();

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("does not clear location.state while session is still pending", () => {
      const composeSeed = {
        outline: "Outline from chat",
        conversationText: "User asked about wiki",
      };
      mockUseLocation.mockReturnValue({
        pathname: "/notes/note-1/page-1/compose",
        search: "",
        hash: "",
        state: { [COMPOSE_SEED_STATE_KEY]: composeSeed },
      });
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ status: "pending" }));

      renderWikiCompose();

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
