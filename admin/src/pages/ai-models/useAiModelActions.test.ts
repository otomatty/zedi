/**
 * useAiModelActions のテスト。
 * - 楽観的更新 → 失敗時 rollback / optimistic update with rollback
 * - mounted ref が false の間は state 更新しない / no state mutation when unmounted
 *
 * Tests for useAiModelActions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiModelActions } from "./useAiModelActions";
import type { AiModelAdmin } from "@/api/admin";

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/admin")>();
  return {
    ...actual,
    patchAiModel: vi.fn(),
  };
});

const { patchAiModel } = await import("@/api/admin");

const baseModel: AiModelAdmin = {
  id: "openai:gpt-4",
  provider: "openai",
  modelId: "gpt-4",
  displayName: "GPT-4",
  tierRequired: "pro",
  inputCostUnits: 100,
  outputCostUnits: 100,
  isActive: true,
  isSystemDefault: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00Z",
};

interface Refs {
  models: AiModelAdmin[];
  setModels: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  isMountedRef: { current: boolean };
  originalModelsRef: { current: AiModelAdmin[] };
}

function createRefs(initial: AiModelAdmin[] = [baseModel]): Refs {
  // setState 互換の更新関数を受け付け、内部配列を更新する
  // Accepts either next-state value or updater fn (matches React.SetStateAction)
  let models = initial;
  const setModels = vi.fn(
    (updater: AiModelAdmin[] | ((prev: AiModelAdmin[]) => AiModelAdmin[])) => {
      models =
        typeof updater === "function"
          ? (updater as (p: AiModelAdmin[]) => AiModelAdmin[])(models)
          : updater;
    },
  );
  return {
    get models() {
      return models;
    },
    setModels,
    setError: vi.fn(),
    isMountedRef: { current: true },
    originalModelsRef: { current: [...initial] },
  };
}

describe("useAiModelActions.handleModelUpdate", () => {
  beforeEach(() => {
    vi.mocked(patchAiModel).mockReset();
  });

  it("成功時: 楽観的更新 → originalModelsRef も更新される / optimistic update + originalModelsRef sync", async () => {
    vi.mocked(patchAiModel).mockResolvedValueOnce({ ...baseModel, displayName: "GPT-4 Updated" });
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleModelUpdate(baseModel, { displayName: "GPT-4 Updated" });
    });

    // setError(null) で先に reset されている
    expect(refs.setError).toHaveBeenCalledWith(null);
    // setModels が楽観的更新で 1 回呼ばれる
    expect(refs.setModels).toHaveBeenCalledTimes(1);
    expect(refs.models[0]?.displayName).toBe("GPT-4 Updated");
    // originalModelsRef も更新される
    expect(refs.originalModelsRef.current[0]?.displayName).toBe("GPT-4 Updated");
  });

  it("失敗時: rollback して setError に message を渡す / rollbacks and surfaces error", async () => {
    vi.mocked(patchAiModel).mockRejectedValueOnce(new Error("nope"));
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleModelUpdate(baseModel, { displayName: "broken" });
    });

    // 楽観的更新（1回目） + rollback（2回目）= 2 回呼ばれる
    expect(refs.setModels).toHaveBeenCalledTimes(2);
    // rollback 後は元の値に戻っている
    expect(refs.models[0]?.displayName).toBe("GPT-4");
    expect(refs.setError).toHaveBeenLastCalledWith("nope");
    // 例外オブジェクトが Error 以外でも対応する別ケースは下のテスト
  });

  it("Error 以外を投げたとき String() 化して setError する / stringifies non-Error throws", async () => {
    vi.mocked(patchAiModel).mockRejectedValueOnce("oops");
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleModelUpdate(baseModel, { displayName: "x" });
    });
    expect(refs.setError).toHaveBeenLastCalledWith("oops");
  });

  it("isMountedRef が false なら早期 return（成功前にアンマウント）/ short-circuits before any state update if unmounted", async () => {
    const refs = createRefs();
    refs.isMountedRef.current = false;

    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleModelUpdate(baseModel, { displayName: "x" });
    });

    expect(refs.setError).not.toHaveBeenCalled();
    expect(refs.setModels).not.toHaveBeenCalled();
    expect(patchAiModel).not.toHaveBeenCalled();
  });

  it("失敗 + アンマウント済みなら rollback も skip する / skips rollback if unmounted between request and failure", async () => {
    let resolveReject: (() => void) | null = null;
    vi.mocked(patchAiModel).mockReturnValueOnce(
      new Promise((_, reject) => {
        resolveReject = () => reject(new Error("late"));
      }) as never,
    );
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.handleModelUpdate(baseModel, { displayName: "x" });
    });

    // 楽観的更新（1回目）は走った後にアンマウント
    expect(refs.setModels).toHaveBeenCalledTimes(1);
    refs.isMountedRef.current = false;

    await act(async () => {
      resolveReject?.();
      await pending;
    });

    // rollback は呼ばれず、setModels は依然 1 回のまま
    expect(refs.setModels).toHaveBeenCalledTimes(1);
  });
});

describe("useAiModelActions.handleToggleActive", () => {
  beforeEach(() => {
    vi.mocked(patchAiModel).mockReset();
  });

  it("originalModel が無いと何もしない / no-op when original model is missing", async () => {
    vi.mocked(patchAiModel).mockResolvedValueOnce(baseModel);
    const refs = createRefs();
    refs.originalModelsRef.current = [];
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleToggleActive(baseModel);
    });

    expect(patchAiModel).not.toHaveBeenCalled();
  });

  it("isActive を反転して PATCH する / toggles isActive based on current value", async () => {
    vi.mocked(patchAiModel).mockResolvedValueOnce({ ...baseModel, isActive: false });
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleToggleActive(baseModel);
    });

    expect(patchAiModel).toHaveBeenCalledWith(baseModel.id, { isActive: false });
  });
});

describe("useAiModelActions.handleTierChange", () => {
  beforeEach(() => {
    vi.mocked(patchAiModel).mockReset();
  });

  it("同じ tier なら no-op / skips when tier is unchanged", async () => {
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleTierChange(baseModel, "pro");
    });

    expect(patchAiModel).not.toHaveBeenCalled();
  });

  it("tier を変更して PATCH する / sends new tier", async () => {
    vi.mocked(patchAiModel).mockResolvedValueOnce({ ...baseModel, tierRequired: "free" });
    const refs = createRefs();
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleTierChange(baseModel, "free");
    });

    expect(patchAiModel).toHaveBeenCalledWith(baseModel.id, { tierRequired: "free" });
  });
});

describe("useAiModelActions.handleSetSystemDefault", () => {
  beforeEach(() => {
    vi.mocked(patchAiModel).mockReset();
  });

  it("成功時: 対象モデルを system default にし originalModelsRef を更新する / sets system default on success", async () => {
    vi.mocked(patchAiModel).mockResolvedValueOnce({ ...baseModel, isSystemDefault: true });
    const otherModel: AiModelAdmin = {
      ...baseModel,
      id: "openai:gpt-4o",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      isSystemDefault: true,
    };
    const refs = createRefs([otherModel, baseModel]);
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleSetSystemDefault(baseModel);
    });

    expect(patchAiModel).toHaveBeenCalledWith(baseModel.id, { isSystemDefault: true });
    expect(refs.models.find((m) => m.id === baseModel.id)?.isSystemDefault).toBe(true);
    expect(refs.models.find((m) => m.id === otherModel.id)?.isSystemDefault).toBe(false);
    expect(refs.originalModelsRef.current.find((m) => m.id === baseModel.id)?.isSystemDefault).toBe(
      true,
    );
  });

  it("失敗時: originalModelsRef へ rollback し setError する / rollbacks on failure", async () => {
    vi.mocked(patchAiModel).mockRejectedValueOnce(new Error("default failed"));
    const otherModel: AiModelAdmin = {
      ...baseModel,
      id: "openai:gpt-4o",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      isSystemDefault: true,
    };
    const refs = createRefs([otherModel, baseModel]);
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleSetSystemDefault(baseModel);
    });

    expect(refs.models.find((m) => m.id === otherModel.id)?.isSystemDefault).toBe(true);
    expect(refs.models.find((m) => m.id === baseModel.id)?.isSystemDefault).toBe(false);
    expect(refs.setError).toHaveBeenLastCalledWith("default failed");
  });

  it("既に system default なら no-op / skips when already default", async () => {
    const defaultModel = { ...baseModel, isSystemDefault: true };
    const refs = createRefs([defaultModel]);
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleSetSystemDefault(defaultModel);
    });

    expect(patchAiModel).not.toHaveBeenCalled();
    expect(refs.setModels).not.toHaveBeenCalled();
  });

  it("非アクティブモデルなら no-op / skips when model is inactive", async () => {
    const inactiveModel = { ...baseModel, isActive: false };
    const refs = createRefs([inactiveModel]);
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    await act(async () => {
      await result.current.handleSetSystemDefault(inactiveModel);
    });

    expect(patchAiModel).not.toHaveBeenCalled();
  });

  it("設定中は二重呼び出しを無視する / ignores concurrent calls while setting", async () => {
    let resolvePatch: (() => void) | null = null;
    vi.mocked(patchAiModel).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = () => resolve({ ...baseModel, isSystemDefault: true });
      }) as never,
    );
    const refs = createRefs([baseModel]);
    const { result } = renderHook(() =>
      useAiModelActions({
        setModels: refs.setModels as never,
        setError: refs.setError as never,
        isMountedRef: refs.isMountedRef as never,
        originalModelsRef: refs.originalModelsRef as never,
      }),
    );

    let first = Promise.resolve();
    let second = Promise.resolve();
    await act(async () => {
      first = result.current.handleSetSystemDefault(baseModel);
      second = result.current.handleSetSystemDefault(baseModel);
    });

    expect(patchAiModel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePatch?.();
      await first;
      await second;
    });
  });
});
