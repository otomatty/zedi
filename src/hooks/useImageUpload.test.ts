import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  providerUploadImage: vi.fn(),
  getToken: vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("./useStorageSettings", () => ({
  useStorageSettings: () => ({
    settings: {
      provider: "s3",
      preferDefaultStorage: true,
      config: {},
      isConfigured: true,
    },
    isLoading: false,
  }),
}));

vi.mock("./useAuth", () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
  }),
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(() => ({
    uploadImage: mocks.providerUploadImage,
  })),
  getSettingsForUpload: vi.fn((settings) => settings),
  isStorageConfiguredForUpload: vi.fn(() => true),
  convertToWebP: vi.fn(async (file: File) => file),
}));

import { useImageUpload } from "./useImageUpload";

describe("useImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerUploadImage.mockResolvedValue("https://cdn.example.com/image.webp");
  });

  it("forwards AbortSignal to the storage provider uploadImage call", async () => {
    const { result } = renderHook(() => useImageUpload());
    const controller = new AbortController();
    const file = new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });

    await act(async () => {
      await result.current.uploadImage(file, { signal: controller.signal });
    });

    expect(mocks.providerUploadImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
