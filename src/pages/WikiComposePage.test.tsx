/**
 * WikiComposePage: route wiring, header actions, session error retry, layout direction.
 * WikiComposePage: ルート配線、ヘッダー操作、セッションエラー再試行、レイアウト方向。
 */
import React from "react";
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

vi.mock("@/components/wikiCompose/EditorPane", () => ({
  EditorPane: () => <div data-testid="editor-pane">EditorPane</div>,
}));

vi.mock("@/components/wikiCompose/ComposePanel", () => ({
  ComposePanel: () => <div data-testid="compose-panel">ComposePanel</div>,
}));

function renderWikiCompose(initialPath = "/notes/note-1/page-1/compose") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/notes/:noteId/:pageId/compose/:sessionId?" element={<WikiComposePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WikiComposePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it("uses a horizontal panel group and no mobile tabs on desktop", () => {
      vi.mocked(useIsMobile).mockReturnValue(false);

      renderWikiCompose();

      expect(screen.getByTestId("resizable-panel-group")).toHaveAttribute(
        "data-direction",
        "horizontal",
      );
      expect(screen.queryByTestId("compose-mobile-tabs")).not.toBeInTheDocument();
    });

    it("shows pane tabs instead of a panel group on mobile", () => {
      vi.mocked(useIsMobile).mockReturnValue(true);

      renderWikiCompose();

      expect(screen.getByTestId("compose-mobile-tabs")).toBeInTheDocument();
      expect(screen.queryByTestId("resizable-panel-group")).not.toBeInTheDocument();
    });
  });

  describe("mobile pane tabs", () => {
    beforeEach(() => {
      vi.mocked(useIsMobile).mockReturnValue(true);
    });

    it("defaults to the compose pane during interrupt phases", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "brief" }));

      renderWikiCompose();

      expect(screen.getByTestId("compose-tab-compose")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("compose-tab-preview")).toHaveAttribute("aria-selected", "false");
    });

    it("defaults to the preview pane while drafting", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "draft" }));

      renderWikiCompose();

      expect(screen.getByTestId("compose-tab-preview")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("compose-tab-compose")).toHaveAttribute("aria-selected", "false");
    });

    it("switches the active pane when a tab is clicked", () => {
      vi.mocked(useWikiComposeSession).mockReturnValue(createMockSession({ phase: "brief" }));

      renderWikiCompose();

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
