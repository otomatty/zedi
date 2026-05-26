/**
 * `useInitialComposeBackend` unit tests (#951).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  loadAISettings: vi.fn(),
  fetchUserAiCredentialsStatus: vi.fn(),
}));

vi.mock("@/lib/aiSettings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aiSettings")>("@/lib/aiSettings");
  return {
    ...actual,
    loadAISettings: mocks.loadAISettings,
    AI_SETTINGS_CHANGED_EVENT: "zedi-ai-settings-changed",
  };
});

vi.mock("@/lib/userAiCredentials", () => ({
  fetchUserAiCredentialsStatus: mocks.fetchUserAiCredentialsStatus,
}));

import { AI_SETTINGS_CHANGED_EVENT } from "@/lib/aiSettings";
import { DEFAULT_AI_SETTINGS } from "@/types/ai";
import { useInitialComposeBackend } from "./useInitialComposeBackend";

const CREDENTIALS_NONE = {
  storageEnabled: false,
  providers: [
    { provider: "anthropic" as const, configured: false },
    { provider: "openai" as const, configured: false },
    { provider: "google" as const, configured: false },
  ],
};

describe("useInitialComposeBackend", () => {
  beforeEach(() => {
    mocks.loadAISettings.mockReset();
    mocks.fetchUserAiCredentialsStatus.mockReset();
    mocks.loadAISettings.mockResolvedValue(DEFAULT_AI_SETTINGS);
    mocks.fetchUserAiCredentialsStatus.mockResolvedValue(CREDENTIALS_NONE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves backend from AI settings on mount", async () => {
    const { result } = renderHook(() => useInitialComposeBackend());

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.backend).toBe("zedi_managed");
  });

  it("marks resolved when a settings-changed load finishes after the initial load", async () => {
    let resolveInitial: (value: typeof DEFAULT_AI_SETTINGS) => void = () => undefined;
    mocks.loadAISettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        }),
    );

    const { result } = renderHook(() => useInitialComposeBackend());
    expect(result.current.isResolved).toBe(false);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(AI_SETTINGS_CHANGED_EVENT));
    });

    await act(async () => {
      resolveInitial(DEFAULT_AI_SETTINGS);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.backend).toBe("zedi_managed");
  });

  it("skips loading when disabled", async () => {
    const { result } = renderHook(() => useInitialComposeBackend({ enabled: false }));

    expect(result.current.isResolved).toBe(true);
    expect(mocks.loadAISettings).not.toHaveBeenCalled();
  });
});
