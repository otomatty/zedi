import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { getAiModels, previewSyncAiModels, syncAiModels, type AiModelAdmin } from "@/api/admin";
import AiModels from "./index";

vi.mock("@/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/admin")>()),
  getAiModels: vi.fn(),
  previewSyncAiModels: vi.fn(),
  syncAiModels: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const outcomes = [
  {
    name: "success",
    settle: <T,>(pending: ReturnType<typeof deferred<T>>, value: T) => pending.resolve(value),
  },
  {
    name: "failure",
    settle: <T,>(pending: ReturnType<typeof deferred<T>>, _value: T) =>
      pending.reject(new Error("stale failure")),
  },
];

const model: AiModelAdmin = {
  id: "openai:test-model",
  provider: "openai",
  modelId: "test-model",
  displayName: "Test model",
  tierRequired: "free",
  inputCostUnits: 1,
  outputCostUnits: 2,
  isActive: true,
  isSystemDefault: false,
  sortOrder: 0,
  createdAt: "2026-05-01T00:00:00Z",
};

// モデル一覧の読み込みを検証する。 / Verify model list loading behavior.
describe("AiModels", () => {
  beforeEach(() => {
    vi.mocked(getAiModels).mockReset();
    vi.mocked(previewSyncAiModels).mockReset().mockResolvedValue([]);
    vi.mocked(syncAiModels).mockReset().mockResolvedValue([]);
  });

  it("shows initial loading and displays the returned model after one request", async () => {
    const pending = deferred<AiModelAdmin[]>();
    vi.mocked(getAiModels).mockReturnValue(pending.promise);

    render(<AiModels />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(getAiModels).toHaveBeenCalledExactlyOnceWith();
    await act(async () => pending.resolve([model]));
    expect(screen.getAllByDisplayValue("Test model")).toHaveLength(2);
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
  });

  it("shows an empty management screen when no models are returned", async () => {
    vi.mocked(getAiModels).mockResolvedValue([]);

    render(<AiModels />);

    expect(await screen.findByText("0 件（有効: 0）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プロバイダーと同期" })).toBeEnabled();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    expect(getAiModels).toHaveBeenCalledExactlyOnceWith();
  });

  it("shows the load error and exits loading", async () => {
    vi.mocked(getAiModels).mockRejectedValue(new Error("models failed"));

    render(<AiModels />);

    expect(await screen.findByText("models failed")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プロバイダーと同期" })).toBeEnabled();
    expect(getAiModels).toHaveBeenCalledExactlyOnceWith();
  });

  it("clears a previous error and keeps the management screen visible while sync refetches models", async () => {
    const reload = deferred<AiModelAdmin[]>();
    vi.mocked(getAiModels)
      .mockRejectedValueOnce(new Error("models failed"))
      .mockReturnValueOnce(reload.promise);
    render(<AiModels />);
    await screen.findByText("models failed");

    fireEvent.click(screen.getByRole("button", { name: "プロバイダーと同期" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /同期実行/ }));
    await act(async () => {});

    expect(previewSyncAiModels).toHaveBeenCalledExactlyOnceWith();
    expect(syncAiModels).toHaveBeenCalledExactlyOnceWith();
    expect(getAiModels).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("models failed")).not.toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "プロバイダーと同期" })).toBeInTheDocument();
    await act(async () => reload.resolve([model]));
    expect(screen.getAllByDisplayValue("Test model")).toHaveLength(2);
  });

  it.each(outcomes)(
    "can unmount before a pending $name without starting another request",
    async ({ settle }) => {
      const pending = deferred<AiModelAdmin[]>();
      vi.mocked(getAiModels).mockReturnValue(pending.promise);
      const { unmount, container } = render(<AiModels />);

      unmount();
      await act(async () => {
        settle(pending, [model]);
      });

      expect(container).toBeEmptyDOMElement();
      expect(getAiModels).toHaveBeenCalledTimes(1);
    },
  );
});
