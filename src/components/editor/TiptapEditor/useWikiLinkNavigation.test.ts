import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWikiLinkNavigation } from "./useWikiLinkNavigation";
import { createHookWrapper } from "@/test/testWrapper";

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/usePageQueries", () => ({
  usePageByTitle: vi.fn(),
  useCreatePage: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

import { usePageByTitle } from "@/hooks/usePageQueries";

describe("useWikiLinkNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePageByTitle).mockReturnValue({
      data: undefined,
      isFetched: false,
    } as ReturnType<typeof usePageByTitle>);
  });

  it("returns initial state with dialog closed and no pending title", () => {
    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  it("opens dialog and sets pendingCreatePageTitle when page is not found", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Some New Page");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("Some New Page");
    });
  });

  it("calls navigate when page is found and does not open dialog", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: title === "Existing Page" ? { id: "existing-id" } : undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Existing Page");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/page/existing-id", {
        replace: false,
        flushSync: true,
      });
    });
    expect(result.current.createPageDialogOpen).toBe(false);
  });

  it("handleCancelCreate closes dialog and clears pending title", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Cancel Test");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
    });

    act(() => {
      result.current.handleCancelCreate();
    });

    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  it("handleConfirmCreate calls mutateAsync and navigates on success", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-page-id" });

    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("New Page Title");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("New Page Title");
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      title: "New Page Title",
      content: "",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/page/new-page-id", {
      replace: false,
      flushSync: true,
    });
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });
});
