/**
 * Tests for {@link useOpenPdfFlow}. Mocks the Tauri dialog plugin + bridge so
 * the orchestration can be verified without an actual desktop runtime.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { createElement, type ReactNode } from "react";

const hoisted = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  toastSpy: vi.fn(),
  dialogOpen: vi.fn(),
  registerPdfSourceMock: vi.fn(),
  registerPdfSourceApiMock: vi.fn(),
  attachPdfSourcePathMock: vi.fn(),
  isTauriDesktopMock: vi.fn().mockReturnValue(true),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => hoisted.navigateSpy };
});

vi.mock("@zedi/ui", async () => {
  const actual = await vi.importActual<typeof import("@zedi/ui")>("@zedi/ui");
  return { ...actual, useToast: () => ({ toast: hoisted.toastSpy }) };
});

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: () => hoisted.isTauriDesktopMock(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => hoisted.dialogOpen(...args),
}));

vi.mock("@/lib/pdfKnowledge/tauriBridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdfKnowledge/tauriBridge")>(
    "@/lib/pdfKnowledge/tauriBridge",
  );
  return {
    ...actual,
    registerPdfSource: (path: string) => hoisted.registerPdfSourceMock(path),
    attachPdfSourcePath: (p: unknown) => hoisted.attachPdfSourcePathMock(p),
  };
});

vi.mock("@/lib/pdfKnowledge/highlightsApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdfKnowledge/highlightsApi")>(
    "@/lib/pdfKnowledge/highlightsApi",
  );
  return {
    ...actual,
    registerPdfSourceApi: (b: unknown) => hoisted.registerPdfSourceApiMock(b),
  };
});

import { useOpenPdfFlow } from "./useOpenPdfFlow";

function Wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, children);
}

describe("useOpenPdfFlow", () => {
  beforeEach(() => {
    hoisted.navigateSpy.mockReset();
    hoisted.toastSpy.mockReset();
    hoisted.dialogOpen.mockReset();
    hoisted.registerPdfSourceMock.mockReset();
    hoisted.registerPdfSourceApiMock.mockReset();
    hoisted.attachPdfSourcePathMock.mockReset();
    hoisted.isTauriDesktopMock.mockReturnValue(true);
  });

  it("is a no-op on non-Tauri runtimes", async () => {
    hoisted.isTauriDesktopMock.mockReturnValue(false);
    const { result } = renderHook(() => useOpenPdfFlow(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.open();
    });
    expect(hoisted.dialogOpen).not.toHaveBeenCalled();
    expect(hoisted.navigateSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the user cancels the file dialog", async () => {
    hoisted.dialogOpen.mockResolvedValue(null);
    const { result } = renderHook(() => useOpenPdfFlow(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.open();
    });
    expect(hoisted.registerPdfSourceMock).not.toHaveBeenCalled();
    expect(hoisted.navigateSpy).not.toHaveBeenCalled();
    expect(hoisted.toastSpy).not.toHaveBeenCalled();
  });

  it("runs the full happy path and navigates to the new source's viewer", async () => {
    hoisted.dialogOpen.mockResolvedValue("/home/me/paper.pdf");
    hoisted.registerPdfSourceMock.mockResolvedValue({
      sha256: "a".repeat(64),
      byteSize: 1024,
      displayName: "paper.pdf",
    });
    hoisted.registerPdfSourceApiMock.mockResolvedValue({
      sourceId: "src-xyz",
      deduped: false,
    });
    hoisted.attachPdfSourcePathMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOpenPdfFlow(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.open();
    });

    expect(hoisted.registerPdfSourceMock).toHaveBeenCalledWith("/home/me/paper.pdf");
    expect(hoisted.registerPdfSourceApiMock).toHaveBeenCalledWith({
      sha256: "a".repeat(64),
      byteSize: 1024,
      displayName: "paper.pdf",
    });
    expect(hoisted.attachPdfSourcePathMock).toHaveBeenCalledWith({
      sourceId: "src-xyz",
      absolutePath: "/home/me/paper.pdf",
      sha256: "a".repeat(64),
    });
    expect(hoisted.navigateSpy).toHaveBeenCalledWith("/sources/src-xyz/pdf");
    expect(result.current.error).toBeNull();
  });

  it("surfaces a toast and exposes error when a step fails", async () => {
    hoisted.dialogOpen.mockResolvedValue("/path/p.pdf");
    hoisted.registerPdfSourceMock.mockRejectedValue(new Error("file too big"));

    const { result } = renderHook(() => useOpenPdfFlow(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.open();
    });

    expect(hoisted.toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("PDF"),
        description: "file too big",
      }),
    );
    expect(hoisted.navigateSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error?.message).toBe("file too big"));
  });
});
