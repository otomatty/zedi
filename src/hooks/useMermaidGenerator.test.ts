/**
 * Tests for {@link useMermaidGenerator}.
 * {@link useMermaidGenerator} のテスト。
 *
 * Issue #743: cover the state machine (idle to generating to completed or error),
 * input validation, callback wiring, AI configuration check, and reset.
 * Issue #743: 状態遷移（idle から generating、完了またはエラーへ）、入力バリデーション、
 * コールバック呼び出し、AI 設定確認、reset を検証する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import type {
  MermaidDiagramType,
  MermaidGeneratorCallbacks,
  MermaidGeneratorResult,
} from "@/lib/mermaidGenerator";
import type { AISettings } from "@/types/ai";

const mockGenerateMermaidDiagram =
  vi.fn<
    (
      text: string,
      diagramTypes: MermaidDiagramType[],
      callbacks: MermaidGeneratorCallbacks,
    ) => Promise<void>
  >();
const mockGetAISettingsOrThrow = vi.fn<() => Promise<AISettings>>();

vi.mock("@/lib/mermaidGenerator", () => ({
  generateMermaidDiagram: (
    text: string,
    diagramTypes: MermaidDiagramType[],
    callbacks: MermaidGeneratorCallbacks,
  ) => mockGenerateMermaidDiagram(text, diagramTypes, callbacks),
  getAISettingsOrThrow: () => mockGetAISettingsOrThrow(),
}));

import { useMermaidGenerator } from "./useMermaidGenerator";

// Safety net to keep spies (e.g. console.error if added in future tests) and
// any module-level setup from leaking between tests on assertion failures.
// assertion 失敗時でも spy やモジュールレベルの設定が次のテストへ漏れないようにする。
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMermaidGenerator", () => {
  beforeEach(() => {
    // `clearAllMocks` only resets call history; implementations set via
    // `mockImplementation` / `mockResolvedValue` / `mockRejectedValueOnce` would
    // leak into later tests. `resetAllMocks` also clears those implementations,
    // so each test starts from a clean baseline.
    // `clearAllMocks` は呼び出し履歴しかクリアしないため、mockImplementation 等の実装が
    // 後続テストへ持ち越される。`resetAllMocks` で実装も含めて初期化する。
    vi.resetAllMocks();
    void i18n.changeLanguage("ja");
  });

  it("starts in idle state with no result/error", () => {
    const { result } = renderHook(() => useMermaidGenerator());

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isAIConfigured).toBeNull();
  });

  it("generate with empty text sets error status and does not call generateMermaidDiagram", async () => {
    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("   ", ["flowchart"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("テキストが空です");
    expect(mockGenerateMermaidDiagram).not.toHaveBeenCalled();
  });

  it("generate with empty diagramTypes sets error status", async () => {
    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("hello", []);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("ダイアグラムタイプを選択してください");
    expect(mockGenerateMermaidDiagram).not.toHaveBeenCalled();
  });

  it("generate transitions to completed on onComplete callback", async () => {
    const completedResult: MermaidGeneratorResult = {
      code: "flowchart TD\nA-->B",
      diagramType: "flowchart",
    };
    mockGenerateMermaidDiagram.mockImplementation(
      (
        _text: string,
        _types: MermaidDiagramType[],
        callbacks: MermaidGeneratorCallbacks,
      ): Promise<void> => {
        callbacks.onComplete(completedResult);
        return Promise.resolve();
      },
    );

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["flowchart"]);
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.result).toEqual(completedResult);
    expect(result.current.error).toBeNull();
    expect(mockGenerateMermaidDiagram).toHaveBeenCalledWith(
      "topic",
      ["flowchart"],
      expect.any(Object),
    );
  });

  it("generate transitions to error when callbacks.onError is invoked", async () => {
    const failure = new Error("boom");
    mockGenerateMermaidDiagram.mockImplementation(
      (
        _text: string,
        _types: MermaidDiagramType[],
        callbacks: MermaidGeneratorCallbacks,
      ): Promise<void> => {
        callbacks.onError(failure);
        return Promise.resolve();
      },
    );

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["sequence"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(failure);
    expect(result.current.result).toBeNull();
  });

  it("generate catches synchronous throws from generateMermaidDiagram and sets error", async () => {
    // True sync throw: the mock raises before returning a promise so the hook's
    // try/catch must convert it into an error state.
    // 真の同期 throw: Promise を返す前に例外を投げ、hook の try/catch でエラー化されることを検証。
    mockGenerateMermaidDiagram.mockImplementationOnce(() => {
      throw new Error("network");
    });

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["pie"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("network");
  });

  it("generate catches async rejections from generateMermaidDiagram and sets error", async () => {
    mockGenerateMermaidDiagram.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["pie"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("network");
  });

  it("generate wraps non-Error rejections into a generic error", async () => {
    mockGenerateMermaidDiagram.mockRejectedValueOnce("not an error");

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["pie"]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("生成中にエラーが発生しました");
  });

  it("reset returns the state machine to idle and clears result/error", async () => {
    mockGenerateMermaidDiagram.mockImplementation(
      (
        _text: string,
        _types: MermaidDiagramType[],
        callbacks: MermaidGeneratorCallbacks,
      ): Promise<void> => {
        callbacks.onComplete({ code: "x", diagramType: "flowchart" });
        return Promise.resolve();
      },
    );

    const { result } = renderHook(() => useMermaidGenerator());

    await act(async () => {
      await result.current.generate("topic", ["flowchart"]);
    });
    expect(result.current.status).toBe("completed");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("checkAIConfigured returns true and sets flag when settings load", async () => {
    mockGetAISettingsOrThrow.mockResolvedValue({ provider: "google" });

    const { result } = renderHook(() => useMermaidGenerator());

    let configured: boolean | undefined;
    await act(async () => {
      configured = await result.current.checkAIConfigured();
    });

    expect(configured).toBe(true);
    await waitFor(() => expect(result.current.isAIConfigured).toBe(true));
  });

  it("checkAIConfigured returns false and sets flag when getAISettingsOrThrow rejects", async () => {
    mockGetAISettingsOrThrow.mockRejectedValue(new Error("AI_NOT_CONFIGURED"));

    const { result } = renderHook(() => useMermaidGenerator());

    let configured: boolean | undefined;
    await act(async () => {
      configured = await result.current.checkAIConfigured();
    });

    expect(configured).toBe(false);
    await waitFor(() => expect(result.current.isAIConfigured).toBe(false));
  });

  it("generate clears any previous error before transitioning to generating", async () => {
    const { result } = renderHook(() => useMermaidGenerator());

    // Trigger an initial error first.
    // まず初期エラーを発生させる。
    await act(async () => {
      await result.current.generate("", ["flowchart"]);
    });
    expect(result.current.status).toBe("error");

    // Stub a long-running generation that resolves later so we can observe the
    // transitional state.
    // 遷移中の状態を観測できるよう、あとで resolve する長時間生成を stub する。
    let resolveCb: (() => void) | null = null;
    mockGenerateMermaidDiagram.mockImplementation(
      (
        _text: string,
        _types: MermaidDiagramType[],
        callbacks: MermaidGeneratorCallbacks,
      ): Promise<void> => {
        return new Promise<void>((resolve) => {
          resolveCb = () => {
            callbacks.onComplete({ code: "x", diagramType: "flowchart" });
            resolve();
          };
        });
      },
    );

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.generate("topic", ["flowchart"]);
    });

    await waitFor(() => expect(result.current.status).toBe("generating"));
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();

    await act(async () => {
      resolveCb?.();
      await pending;
    });
    expect(result.current.status).toBe("completed");
  });
});
