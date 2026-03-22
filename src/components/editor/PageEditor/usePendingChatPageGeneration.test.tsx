import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { usePendingChatPageGeneration } from "./usePendingChatPageGeneration";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const generateWikiContentFromChatOutlineStream = vi.fn();

vi.mock("@/lib/wikiGenerator", () => ({
  generateWikiContentFromChatOutlineStream: (
    title: string,
    outline: string,
    conversationText: string,
    handlers: {
      onChunk: (chunk: string) => void;
      onComplete: (result: { content: string }) => void;
      onError: (err: Error) => void;
    },
    signal: AbortSignal,
  ) => generateWikiContentFromChatOutlineStream(title, outline, conversationText, handlers, signal),
}));

const defaultPending = { outline: "- a", conversationText: "User: hi" };

function buildHookOptions(
  overrides: Partial<Parameters<typeof usePendingChatPageGeneration>[0]> = {},
) {
  return {
    currentPageId: "page-1" as string | null,
    isInitialized: true,
    title: "Page title",
    setContent: vi.fn(),
    setWikiContentForCollab: vi.fn(),
    saveChanges: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

describe("usePendingChatPageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateWikiContentFromChatOutlineStream.mockImplementation(
      async (
        _title: string,
        _outline: string,
        _conversationText: string,
        handlers: {
          onChunk: (chunk: string) => void;
          onComplete: (result: { content: string }) => void;
          onError: (err: Error) => void;
        },
      ) => {
        await Promise.resolve();
        handlers.onComplete({ content: "# Generated" });
      },
    );
  });

  it("replaces location state to clear pendingChatPageGeneration after capture", async () => {
    const seen: Location[] = [];
    function LocationRecorder() {
      const loc = useLocation();
      useEffect(() => {
        seen.push(loc);
      }, [loc]);
      return null;
    }

    renderHook(() => usePendingChatPageGeneration(buildHookOptions()), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/page/page-1",
              state: { pendingChatPageGeneration: defaultPending },
            },
          ]}
        >
          <LocationRecorder />
          {children}
        </MemoryRouter>
      ),
    });

    await waitFor(() => {
      expect(seen.some((l) => l.state === null)).toBe(true);
    });
  });

  it("calls generateWikiContentFromChatOutlineStream once for the same page and pending payload", async () => {
    renderHook(() => usePendingChatPageGeneration(buildHookOptions()), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/page/page-1",
              state: { pendingChatPageGeneration: defaultPending },
            },
          ]}
        >
          {children}
        </MemoryRouter>
      ),
    });

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).toHaveBeenCalledTimes(1);
    });
  });

  it("does not start a second stream when pathname changes away from capture route", async () => {
    function Subject() {
      const { id } = useParams();
      const navigate = useNavigate();
      usePendingChatPageGeneration(
        buildHookOptions({
          currentPageId: id ?? null,
        }),
      );
      return (
        <button type="button" data-testid="go-p2" onClick={() => navigate("/page/page-2")}>
          go
        </button>
      );
    }

    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/page/page-1",
            state: { pendingChatPageGeneration: defaultPending },
          },
        ]}
      >
        <Routes>
          <Route path="/page/:id" element={<Subject />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByTestId("go-p2"));

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).toHaveBeenCalledTimes(1);
    });
  });
});
