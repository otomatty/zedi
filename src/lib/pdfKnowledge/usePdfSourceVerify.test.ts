/**
 * Unit tests for {@link usePdfSourceVerify}.
 *
 * The hook is straight `useQuery` plumbing; the only behaviour worth covering
 * is the platform gate and the defensive {@link PdfKnowledgeUnsupportedError}
 * fallback.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const verifyPdfSourceMock = vi.fn();
const isTauriDesktopMock = vi.fn();

vi.mock("./tauriBridge", async () => {
  const actual = await vi.importActual<typeof import("./tauriBridge")>("./tauriBridge");
  return {
    ...actual,
    verifyPdfSource: (sourceId: string) => verifyPdfSourceMock(sourceId),
  };
});

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: () => isTauriDesktopMock(),
}));

import { usePdfSourceVerify } from "./usePdfSourceVerify";
import { PdfKnowledgeUnsupportedError } from "./tauriBridge";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("usePdfSourceVerify", () => {
  beforeEach(() => {
    verifyPdfSourceMock.mockReset();
    isTauriDesktopMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the bridge on web (enabled=false)", async () => {
    isTauriDesktopMock.mockReturnValue(false);
    verifyPdfSourceMock.mockResolvedValue({
      exists: true,
      sizeChanged: false,
      mtimeChanged: false,
      absolutePathKnown: true,
    });
    const { result } = renderHook(() => usePdfSourceVerify("source-1"), {
      wrapper: makeWrapper(),
    });
    // Give the runtime a tick — should still not run.
    await new Promise((r) => setTimeout(r, 10));
    expect(verifyPdfSourceMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("calls the bridge on Tauri and surfaces the result", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    verifyPdfSourceMock.mockResolvedValue({
      exists: true,
      sizeChanged: false,
      mtimeChanged: false,
      absolutePathKnown: true,
    });
    const { result } = renderHook(() => usePdfSourceVerify("source-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(verifyPdfSourceMock).toHaveBeenCalledWith("source-1");
    expect(result.current.data?.exists).toBe(true);
  });

  it("refetch re-invokes the bridge", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    verifyPdfSourceMock.mockResolvedValue({
      exists: true,
      sizeChanged: false,
      mtimeChanged: false,
      absolutePathKnown: true,
    });
    const { result } = renderHook(() => usePdfSourceVerify("source-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.refetch();
    expect(verifyPdfSourceMock).toHaveBeenCalledTimes(2);
  });

  it("returns null instead of throwing when the bridge throws PdfKnowledgeUnsupportedError", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    verifyPdfSourceMock.mockRejectedValue(new PdfKnowledgeUnsupportedError());
    const { result } = renderHook(() => usePdfSourceVerify("source-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("propagates non-Unsupported errors", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    verifyPdfSourceMock.mockRejectedValue(new Error("disk gone"));
    const { result } = renderHook(() => usePdfSourceVerify("source-1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("disk gone");
  });

  it("does not call the bridge when sourceId is undefined", async () => {
    isTauriDesktopMock.mockReturnValue(true);
    const { result } = renderHook(() => usePdfSourceVerify(undefined), {
      wrapper: makeWrapper(),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(verifyPdfSourceMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
