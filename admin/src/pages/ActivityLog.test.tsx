import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { listActivity, type ActivityListResponse } from "@/api/activity";
import ActivityLog from "./ActivityLog";

vi.mock("@/api/activity", () => ({ listActivity: vi.fn() }));
vi.mock("@zedi/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@zedi/ui")>()),
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
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

function response(title: string): ActivityListResponse {
  return {
    entries: [
      {
        id: title,
        kind: "clip_ingest",
        actor: "user",
        target_page_ids: [],
        detail: { title },
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
    total: 1,
    limit: 100,
  };
}

// 活動ログの取得と表示を検証する。 / Verify activity loading and display behavior.
describe("ActivityLog", () => {
  beforeEach(() => {
    vi.mocked(listActivity).mockReset();
  });

  it("shows loading immediately and displays the initial response after one request", async () => {
    const pending = deferred<ActivityListResponse>();
    vi.mocked(listActivity).mockReturnValue(pending.promise);

    render(<ActivityLog />);

    expect(screen.getByRole("button", { name: "読み込み中..." })).toBeDisabled();
    expect(listActivity).toHaveBeenCalledExactlyOnceWith({
      kind: undefined,
      actor: undefined,
      limit: 100,
    });
    await act(async () => pending.resolve(response("Initial entry")));
    expect(screen.getByText("Initial entry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeEnabled();
  });

  it("clears an error at retry start and then shows the empty result", async () => {
    const pending = deferred<ActivityListResponse>();
    vi.mocked(listActivity)
      .mockRejectedValueOnce(new Error("activity failed"))
      .mockReturnValueOnce(pending.promise);
    render(<ActivityLog />);
    expect(await screen.findByText("activity failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));

    expect(screen.queryByText("activity failed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "読み込み中..." })).toBeDisabled();
    expect(listActivity).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ entries: [], total: 0, limit: 100 }));
    expect(screen.getByText("活動ログはまだありません。")).toBeInTheDocument();
  });

  it("requests each updated filter combination once and reloads with the current filters", async () => {
    vi.mocked(listActivity).mockResolvedValue(response("Filtered entry"));
    render(<ActivityLog />);
    await screen.findByText("Filtered entry");

    fireEvent.change(screen.getAllByRole("combobox")[0] as HTMLElement, {
      target: { value: "lint_run" },
    });
    await act(async () => {});
    expect(listActivity).toHaveBeenNthCalledWith(2, {
      kind: "lint_run",
      actor: undefined,
      limit: 100,
    });
    fireEvent.change(screen.getAllByRole("combobox")[1] as HTMLElement, {
      target: { value: "system" },
    });
    await act(async () => {});
    expect(listActivity).toHaveBeenNthCalledWith(3, {
      kind: "lint_run",
      actor: "system",
      limit: 100,
    });
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    await act(async () => {});
    expect(listActivity).toHaveBeenNthCalledWith(4, {
      kind: "lint_run",
      actor: "system",
      limit: 100,
    });
    expect(listActivity).toHaveBeenCalledTimes(4);
  });

  it.each(outcomes)(
    "ignores an older $name while the newest request is still loading",
    async ({ settle }) => {
      const older = deferred<ActivityListResponse>();
      const latest = deferred<ActivityListResponse>();
      vi.mocked(listActivity)
        .mockResolvedValueOnce(response("Retained entry"))
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise);
      render(<ActivityLog />);
      await screen.findByText("Retained entry");

      fireEvent.change(screen.getAllByRole("combobox")[0] as HTMLElement, {
        target: { value: "lint_run" },
      });
      fireEvent.change(screen.getAllByRole("combobox")[1] as HTMLElement, {
        target: { value: "system" },
      });
      await act(async () => {
        settle(older, response("Stale entry"));
      });

      expect(screen.getByText("Retained entry")).toBeInTheDocument();
      expect(screen.queryByText("Stale entry")).not.toBeInTheDocument();
      expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "読み込み中..." })).toBeDisabled();
      await act(async () => latest.resolve(response("Latest entry")));
      expect(screen.getByText("Latest entry")).toBeInTheDocument();
      expect(screen.queryByText("Retained entry")).not.toBeInTheDocument();
      expect(listActivity).toHaveBeenCalledTimes(3);
    },
  );

  it("does not replace a newer result when an older request finishes later", async () => {
    const older = deferred<ActivityListResponse>();
    vi.mocked(listActivity)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(response("Latest entry"));
    render(<ActivityLog />);
    fireEvent.change(screen.getAllByRole("combobox")[0] as HTMLElement, {
      target: { value: "lint_run" },
    });
    await screen.findByText("Latest entry");

    await act(async () => older.resolve(response("Stale entry")));

    expect(screen.getByText("Latest entry")).toBeInTheDocument();
    expect(screen.queryByText("Stale entry")).not.toBeInTheDocument();
    expect(listActivity).toHaveBeenCalledTimes(2);
  });

  it.each(outcomes)(
    "can unmount with a pending $name without starting another request",
    async ({ settle }) => {
      const pending = deferred<ActivityListResponse>();
      vi.mocked(listActivity).mockReturnValue(pending.promise);
      const { unmount, container } = render(<ActivityLog />);

      unmount();
      await act(async () => {
        settle(pending, response("Unmounted entry"));
      });

      expect(container).toBeEmptyDOMElement();
      expect(listActivity).toHaveBeenCalledTimes(1);
    },
  );
});
