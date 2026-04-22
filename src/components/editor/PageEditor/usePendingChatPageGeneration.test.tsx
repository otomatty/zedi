import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, renderHook, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useEffect } from "react";
import type { Location } from "react-router-dom";
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
              pathname: "/pages/page-1",
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
              pathname: "/pages/page-1",
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
        <button type="button" data-testid="go-p2" onClick={() => navigate("/pages/page-2")}>
          go
        </button>
      );
    }

    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/pages/page-1",
            state: { pendingChatPageGeneration: defaultPending },
          },
        ]}
      >
        <Routes>
          <Route path="/pages/:id" element={<Subject />} />
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

  it("on completion calls saveChanges, setContent, and success toast", async () => {
    const setContent = vi.fn();
    const setWikiContentForCollab = vi.fn();
    const saveChanges = vi.fn();
    const toast = vi.fn();

    renderHook(
      () =>
        usePendingChatPageGeneration(
          buildHookOptions({
            setContent,
            setWikiContentForCollab,
            saveChanges,
            toast,
          }),
        ),
      {
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/pages/page-1",
                state: { pendingChatPageGeneration: defaultPending },
              },
            ]}
          >
            {children}
          </MemoryRouter>
        ),
      },
    );

    await waitFor(() => {
      expect(saveChanges).toHaveBeenCalledWith("Page title", expect.any(String));
      expect(setContent).toHaveBeenCalled();
      expect(setWikiContentForCollab).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith({ title: "aiChat.notifications.pageBodyGenerated" });
    });
  });

  it("shows pageBodyGenerateFailed toast when stream reports a non-abort error", async () => {
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
        handlers.onError(new Error("stream failed"));
      },
    );

    const toast = vi.fn();

    renderHook(() => usePendingChatPageGeneration(buildHookOptions({ toast })), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/pages/page-1",
              state: { pendingChatPageGeneration: defaultPending },
            },
          ]}
        >
          {children}
        </MemoryRouter>
      ),
    });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: "aiChat.notifications.pageBodyGenerateFailed",
        variant: "destructive",
      });
    });
  });

  it("does not show a destructive toast when error message is ABORTED", async () => {
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
        handlers.onError(new Error("ABORTED"));
      },
    );

    const toast = vi.fn();

    renderHook(() => usePendingChatPageGeneration(buildHookOptions({ toast })), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/pages/page-1",
              state: { pendingChatPageGeneration: defaultPending },
            },
          ]}
        >
          {children}
        </MemoryRouter>
      ),
    });

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).toHaveBeenCalled();
    });

    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });

  it("does not start generation until the editor is initialized", async () => {
    const { rerender } = renderHook(
      ({ initialized }: { initialized: boolean }) =>
        usePendingChatPageGeneration(buildHookOptions({ isInitialized: initialized })),
      {
        initialProps: { initialized: false },
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/pages/page-1",
                state: { pendingChatPageGeneration: defaultPending },
              },
            ]}
          >
            {children}
          </MemoryRouter>
        ),
      },
    );

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).not.toHaveBeenCalled();
    });

    rerender({ initialized: true });

    await waitFor(() => {
      expect(generateWikiContentFromChatOutlineStream).toHaveBeenCalledTimes(1);
    });
  });

  it("does not start generation when title is blank", async () => {
    const blankTitleOptions = buildHookOptions({ title: "   " });
    renderHook(() => usePendingChatPageGeneration(blankTitleOptions), {
      wrapper: ({ children }) => (
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/pages/page-1",
              state: { pendingChatPageGeneration: defaultPending },
            },
          ]}
        >
          {children}
        </MemoryRouter>
      ),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(generateWikiContentFromChatOutlineStream).not.toHaveBeenCalled();
  });

  it("invokes setContent when the stream emits chunks (throttled path) before completion", async () => {
    vi.useFakeTimers();
    try {
      const setContent = vi.fn();
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
          handlers.onChunk("## ");
          handlers.onChunk("Hi");
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 200);
          });
          handlers.onComplete({ content: "## Hi" });
        },
      );

      renderHook(() => usePendingChatPageGeneration(buildHookOptions({ setContent })), {
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={[
              {
                pathname: "/pages/page-1",
                state: { pendingChatPageGeneration: defaultPending },
              },
            ]}
          >
            {children}
          </MemoryRouter>
        ),
      });

      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(setContent).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
