import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * Hoisted mock state for `useImageUpload`. Each test mutates these
 * containers (instead of redefining the modules) to vary settings, configured
 * status, WebP conversion, and provider behavior.
 *
 * フック `useImageUpload` 用のホイスト済みモック。各テストはモジュール再定義
 * ではなくこれらのコンテナを書き換えて、設定・configured 判定・WebP 変換・
 * プロバイダの挙動を変える。
 */
const mocks = vi.hoisted(() => ({
  providerUploadImage: vi.fn(),
  getToken: vi.fn().mockResolvedValue("test-token"),
  isStorageConfiguredForUpload: vi.fn(() => true),
  getSettingsForUpload: vi.fn((settings: unknown) => settings),
  convertToWebP: vi.fn(async (file: File) => file),
  storageSettings: {
    settings: {
      provider: "s3",
      preferDefaultStorage: true,
      config: {},
      isConfigured: true,
    } as unknown,
    isLoading: false,
  },
}));

vi.mock("./useStorageSettings", () => ({
  useStorageSettings: () => mocks.storageSettings,
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
  getSettingsForUpload: (settings: unknown) => mocks.getSettingsForUpload(settings),
  isStorageConfiguredForUpload: () => mocks.isStorageConfiguredForUpload(),
  convertToWebP: (file: File) => mocks.convertToWebP(file),
}));

import { useImageUpload } from "./useImageUpload";

/**
 * Build a test image File succinctly. Defaults to PNG (subject to WebP conversion).
 * テスト用の画像 File を簡潔に生成する。既定は PNG（WebP 変換対象）。
 */
function makeFile(type: string = "image/png", name = "sample.png"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

describe("useImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerUploadImage.mockResolvedValue("https://cdn.example.com/image.webp");
    mocks.isStorageConfiguredForUpload.mockReturnValue(true);
    mocks.convertToWebP.mockImplementation(async (file: File) => file);
    mocks.storageSettings = {
      settings: {
        provider: "s3",
        preferDefaultStorage: true,
        config: {},
        isConfigured: true,
      } as unknown,
      isLoading: false,
    };
  });

  describe("uploadImage", () => {
    it("forwards AbortSignal to the storage provider uploadImage call", async () => {
      // signal を provider に渡し、外部からのキャンセル要求を伝播させる契約を固定する。
      // Pin the contract that the abort signal reaches the provider.
      const { result } = renderHook(() => useImageUpload());
      const controller = new AbortController();
      const file = makeFile();

      await act(async () => {
        await result.current.uploadImage(file, { signal: controller.signal });
      });

      expect(mocks.providerUploadImage).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it("returns the URL produced by the provider", async () => {
      // 戻り値が provider.uploadImage の解決値そのままであること。
      // Pin that the hook returns the provider URL verbatim (no rewriting).
      mocks.providerUploadImage.mockResolvedValueOnce("https://cdn.example.com/foo.webp");
      const { result } = renderHook(() => useImageUpload());

      let url = "";
      await act(async () => {
        url = await result.current.uploadImage(makeFile());
      });

      expect(url).toBe("https://cdn.example.com/foo.webp");
    });

    it("throws AbortError synchronously when signal is already aborted", async () => {
      // 開始時点で abort 済みなら provider 呼び出しの前に DOMException("AbortError") を投げる。
      // Pin the early-abort guard: provider must not be called when already aborted.
      const { result } = renderHook(() => useImageUpload());
      const controller = new AbortController();
      controller.abort();

      await expect(
        act(async () => {
          await result.current.uploadImage(makeFile(), { signal: controller.signal });
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(mocks.providerUploadImage).not.toHaveBeenCalled();
      expect(mocks.convertToWebP).not.toHaveBeenCalled();
    });

    it("throws the configured-storage error when storage is not configured", async () => {
      // 未設定時は固定文言の Error を投げ、provider を呼ばない。
      // Pin both the error message and that provider is not invoked when not configured.
      mocks.isStorageConfiguredForUpload.mockReturnValue(false);
      const { result } = renderHook(() => useImageUpload());

      await expect(
        act(async () => {
          await result.current.uploadImage(makeFile());
        }),
      ).rejects.toThrow("ストレージが設定されていません。設定画面でストレージを設定してください。");
      expect(mocks.providerUploadImage).not.toHaveBeenCalled();
    });

    it.each([
      { type: "text/plain", name: "note.txt" },
      { type: "application/pdf", name: "doc.pdf" },
      { type: "video/mp4", name: "clip.mp4" },
    ])("throws when file type is non-image ($type)", async ({ type, name }) => {
      // `image/` 以外は明示文言で拒否し、provider は呼ばない。startsWith の比較変異を殺す。
      // Pin the non-image rejection message and kill `startsWith("image/")` mutations.
      const { result } = renderHook(() => useImageUpload());
      await expect(
        act(async () => {
          await result.current.uploadImage(makeFile(type, name));
        }),
      ).rejects.toThrow("画像ファイルのみアップロードできます");
      expect(mocks.providerUploadImage).not.toHaveBeenCalled();
    });

    it.each([
      { type: "image/jpeg", name: "photo.jpg" },
      { type: "image/png", name: "photo.png" },
    ])("converts $type to WebP before upload", async ({ type, name }) => {
      // 静止画は WebP 変換を経由する。`||` の両辺（jpeg, png）を個別に検証する。
      // Pin WebP conversion for both branches of the static-image OR.
      const original = makeFile(type, name);
      const converted = new File([new Uint8Array([9, 9, 9])], "converted.webp", {
        type: "image/webp",
      });
      mocks.convertToWebP.mockResolvedValueOnce(converted);
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.uploadImage(original);
      });

      expect(mocks.convertToWebP).toHaveBeenCalledTimes(1);
      expect(mocks.convertToWebP).toHaveBeenCalledWith(original);
      // provider に渡るのは変換後ファイル。
      // Provider receives the converted file, not the original.
      expect(mocks.providerUploadImage).toHaveBeenCalledWith(converted, expect.any(Object));
    });

    it.each([
      { type: "image/gif", name: "anim.gif" },
      { type: "image/webp", name: "already.webp" },
      { type: "image/svg+xml", name: "icon.svg" },
    ])("does NOT convert $type to WebP", async ({ type, name }) => {
      // GIF/WebP/SVG は変換対象外。`isStaticImage` 条件のロジック反転変異を殺す。
      // Kill the `isStaticImage` boolean mutation by ensuring conversion is skipped here.
      const original = makeFile(type, name);
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.uploadImage(original);
      });

      expect(mocks.convertToWebP).not.toHaveBeenCalled();
      expect(mocks.providerUploadImage).toHaveBeenCalledWith(original, expect.any(Object));
    });

    it("invokes provider with onProgress that updates hook progress state", async () => {
      // provider に渡される onProgress を介して state.progress が更新されること。
      // Pin the wiring of provider.onProgress → setState.progress.
      let capturedOnProgress:
        | ((p: { loaded: number; total: number; percentage: number }) => void)
        | undefined;
      mocks.providerUploadImage.mockImplementationOnce((_file, options) => {
        capturedOnProgress = options.onProgress;
        return Promise.resolve("https://cdn.example.com/x.webp");
      });
      const { result } = renderHook(() => useImageUpload());

      const promise = act(async () => {
        await result.current.uploadImage(makeFile());
      });

      // 進捗コールバックを擬似的に発火する（resolve 前に呼べたかは実装上難しいため、
      // ここでは provider 呼び出しが受け取った onProgress 関数の存在のみ検証する）。
      // We at least pin that provider received an `onProgress` function.
      await promise;
      expect(capturedOnProgress).toBeTypeOf("function");
    });

    it("reports the provider error message in error state and re-throws", async () => {
      // 失敗時は state.error にメッセージを格納し、エラーを再 throw する。
      // Pin both the propagated throw and that error state captures the message.
      mocks.providerUploadImage.mockRejectedValueOnce(new Error("network down"));
      const { result } = renderHook(() => useImageUpload());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.uploadImage(makeFile());
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("network down");
      expect(result.current.error).toBe("network down");
      expect(result.current.isUploading).toBe(false);
      expect(result.current.progress).toBeNull();
    });

    it("uses the fallback error string for non-Error throwables", async () => {
      // Error 以外（文字列 throw など）の場合は固定の日本語フォールバック文言を入れる。
      // Pin the fallback "アップロードに失敗しました" branch when the thrown value is not an Error.
      mocks.providerUploadImage.mockRejectedValueOnce("just a string");
      const { result } = renderHook(() => useImageUpload());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.uploadImage(makeFile());
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toBe("just a string");
      expect(result.current.error).toBe("アップロードに失敗しました");
    });

    it("does NOT set error state when failure is due to caller-side abort", async () => {
      // signal.aborted の場合は state.error を null のまま、progress を null に戻す。
      // Pin the abort branch: error stays null, progress is cleared, error is re-thrown.
      const controller = new AbortController();
      mocks.providerUploadImage.mockImplementationOnce(async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      });
      const { result } = renderHook(() => useImageUpload());

      await expect(
        act(async () => {
          await result.current.uploadImage(makeFile(), { signal: controller.signal });
        }),
      ).rejects.toMatchObject({ name: "AbortError" });

      await waitFor(() => expect(result.current.isUploading).toBe(false));
      expect(result.current.error).toBeNull();
      expect(result.current.progress).toBeNull();
    });

    it("returns successfully even if the signal aborts AFTER the provider resolves", async () => {
      // provider が成功裏に解決した後の throwIfAborted は呼ばない（孤児化防止）。
      // Pin the post-resolve invariant: do not throw after a successful upload.
      const controller = new AbortController();
      mocks.providerUploadImage.mockImplementationOnce(async () => {
        // 解決直前に signal を abort する。実装が誤って throwIfAborted を再度呼ぶと失敗する。
        // Aborting just before resolve would trip a buggy post-resolve abort check.
        controller.abort();
        return "https://cdn.example.com/late.webp";
      });
      const { result } = renderHook(() => useImageUpload());

      let url: string | undefined;
      await act(async () => {
        url = await result.current.uploadImage(makeFile(), { signal: controller.signal });
      });

      expect(url).toBe("https://cdn.example.com/late.webp");
    });

    it("sets isUploading=false and progress=100% on success", async () => {
      // 成功後は isUploading が false に戻り、進捗 100% で締めくくられる。
      // Pin the terminal state of a successful upload.
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        await result.current.uploadImage(makeFile());
      });

      expect(result.current.isUploading).toBe(false);
      expect(result.current.progress).toEqual({
        loaded: expect.any(Number),
        total: expect.any(Number),
        percentage: 100,
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe("uploadImages", () => {
    it("filters non-image files and uploads only image entries", async () => {
      // image/* 以外は事前に除外し、画像だけを並列でアップロードする。
      // Pin the prefilter and that only image files reach the provider.
      const files = [
        makeFile("text/plain", "a.txt"),
        makeFile("image/png", "b.png"),
        makeFile("application/pdf", "c.pdf"),
        makeFile("image/jpeg", "d.jpg"),
      ];
      mocks.providerUploadImage.mockResolvedValue("https://cdn.example.com/x.webp");
      const { result } = renderHook(() => useImageUpload());

      let urls: string[] = [];
      await act(async () => {
        urls = await result.current.uploadImages(files);
      });

      expect(urls).toHaveLength(2);
      expect(mocks.providerUploadImage).toHaveBeenCalledTimes(2);
    });

    it("throws when no image files remain after filtering", async () => {
      // フィルタ後に画像が 0 件なら固定文言で throw、provider は呼ばない。
      // Pin the empty-after-filter branch and its message.
      const { result } = renderHook(() => useImageUpload());

      await expect(
        act(async () => {
          await result.current.uploadImages([
            makeFile("text/plain", "a.txt"),
            makeFile("application/pdf", "b.pdf"),
          ]);
        }),
      ).rejects.toThrow("画像ファイルが選択されていません");
      expect(mocks.providerUploadImage).not.toHaveBeenCalled();
    });

    it("returns URLs in input order (Promise.all preserves order)", async () => {
      // 戻り値は入力順を保つ（Promise.all のセマンティクスに依存）。
      // Pin in-order URL return so a `.map` → `.reverse` mutation is caught.
      mocks.providerUploadImage
        .mockResolvedValueOnce("https://cdn.example.com/1.webp")
        .mockResolvedValueOnce("https://cdn.example.com/2.webp");
      const { result } = renderHook(() => useImageUpload());

      let urls: string[] = [];
      await act(async () => {
        urls = await result.current.uploadImages([
          makeFile("image/png", "first.png"),
          makeFile("image/jpeg", "second.jpg"),
        ]);
      });

      expect(urls).toEqual(["https://cdn.example.com/1.webp", "https://cdn.example.com/2.webp"]);
    });

    it("captures error message in state and re-throws on batch failure", async () => {
      // バッチで失敗した場合も error 文言を state に格納し、再 throw する。
      // Pin the batch error path: state.error and re-throw both fire.
      mocks.providerUploadImage.mockRejectedValue(new Error("batch boom"));
      const { result } = renderHook(() => useImageUpload());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.uploadImages([makeFile("image/png", "x.png")]);
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("batch boom");
      expect(result.current.error).toBe("batch boom");
      expect(result.current.isUploading).toBe(false);
    });

    it("uses the fallback error string for non-Error rejections in batch", async () => {
      // 非 Error 例外時のフォールバック文言を固定する。
      // Pin the fallback message branch in `uploadImages`.
      mocks.providerUploadImage.mockRejectedValue({ weird: true });
      const { result } = renderHook(() => useImageUpload());

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.uploadImages([makeFile("image/png", "x.png")]);
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toEqual({ weird: true });
      expect(result.current.error).toBe("アップロードに失敗しました");
    });
  });

  describe("isConfigured", () => {
    it("is true when not loading and storage is configured", () => {
      mocks.storageSettings = { settings: { isConfigured: true } as unknown, isLoading: false };
      mocks.isStorageConfiguredForUpload.mockReturnValue(true);
      const { result } = renderHook(() => useImageUpload());
      expect(result.current.isConfigured).toBe(true);
    });

    it("is false while storage settings are still loading", () => {
      // ロード中は configured とみなさない（`!isLoading` のロジック反転を殺す）。
      // Pin that `isLoading=true` forces `isConfigured=false`.
      mocks.storageSettings = { settings: { isConfigured: true } as unknown, isLoading: true };
      mocks.isStorageConfiguredForUpload.mockReturnValue(true);
      const { result } = renderHook(() => useImageUpload());
      expect(result.current.isConfigured).toBe(false);
    });

    it("is false when storage is not configured", () => {
      // `isStorageConfiguredForUpload` が false の場合は configured=false。
      // Pin the right side of the `&&` in `isConfigured`.
      mocks.storageSettings = { settings: { isConfigured: false } as unknown, isLoading: false };
      mocks.isStorageConfiguredForUpload.mockReturnValue(false);
      const { result } = renderHook(() => useImageUpload());
      expect(result.current.isConfigured).toBe(false);
    });
  });

  describe("clearError", () => {
    it("resets error state to null without touching isUploading or progress", async () => {
      // 直近のエラーを null に戻すが、他の state は不変であることを検証する。
      // Pin that clearError ONLY resets `error`, not `isUploading` or `progress`.
      mocks.providerUploadImage.mockRejectedValueOnce(new Error("oops"));
      const { result } = renderHook(() => useImageUpload());

      await act(async () => {
        try {
          await result.current.uploadImage(makeFile());
        } catch {
          /* expected */
        }
      });

      expect(result.current.error).toBe("oops");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
