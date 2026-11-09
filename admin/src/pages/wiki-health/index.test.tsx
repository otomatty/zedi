import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { getLintFindings, resolveLintFinding, runLint, type LintFindingItem } from "@/api/lint";
import WikiHealth from "./index";

vi.mock("@/api/lint", () => ({
  getLintFindings: vi.fn(),
  resolveLintFinding: vi.fn(),
  runLint: vi.fn(),
}));
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

type FindingsResponse = Awaited<ReturnType<typeof getLintFindings>>;
const finding: LintFindingItem = {
  id: "finding-1",
  rule: "orphan",
  severity: "warn",
  page_ids: [],
  detail: { title: "Initial finding" },
  created_at: "2026-05-01T00:00:00Z",
  resolved_at: null,
};
function response(title: string): FindingsResponse {
  return { findings: [{ ...finding, detail: { title } }], total: 1 };
}

// Wiki診断の読み込みと再取得を検証する。 / Verify Wiki findings loading and refetching.
describe("WikiHealth", () => {
  beforeEach(() => {
    vi.mocked(getLintFindings).mockReset();
    vi.mocked(runLint).mockReset();
    vi.mocked(resolveLintFinding).mockReset().mockResolvedValue({ finding });
  });

  it("shows loading initially and renders the response after one list request", async () => {
    const pending = deferred<FindingsResponse>();
    vi.mocked(getLintFindings).mockReturnValue(pending.promise);

    render(<WikiHealth />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lint 実行" })).toBeDisabled();
    expect(getLintFindings).toHaveBeenCalledExactlyOnceWith();
    await act(async () => pending.resolve(response("Initial finding")));
    expect(screen.getByText("Initial finding")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lint 実行" })).toBeEnabled();
  });

  it("shows the empty result", async () => {
    vi.mocked(getLintFindings).mockResolvedValue({ findings: [], total: 0 });

    render(<WikiHealth />);

    expect(
      await screen.findByText("Lint findings はありません。「Lint 実行」をクリックしてください。"),
    ).toBeInTheDocument();
    expect(getLintFindings).toHaveBeenCalledExactlyOnceWith();
  });

  it("clears the previous load error when a lint run starts its refetch", async () => {
    const run = deferred<Awaited<ReturnType<typeof runLint>>>();
    const reload = deferred<FindingsResponse>();
    vi.mocked(getLintFindings)
      .mockRejectedValueOnce(new Error("findings failed"))
      .mockReturnValueOnce(reload.promise);
    vi.mocked(runLint).mockReturnValue(run.promise);
    render(<WikiHealth />);
    expect(await screen.findByText("findings failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lint 実行" }));

    expect(screen.getByRole("button", { name: "実行中..." })).toBeDisabled();
    expect(runLint).toHaveBeenCalledExactlyOnceWith();
    await act(async () => run.resolve({ summary: [{ rule: "orphan", count: 1 }], total: 1 }));
    expect(getLintFindings).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("findings failed")).not.toBeInTheDocument();
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    await act(async () => reload.resolve(response("Reloaded finding")));
    expect(screen.getByText("Reloaded finding")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
  });

  it("filters existing findings without another API request", async () => {
    vi.mocked(getLintFindings).mockResolvedValue(response("Initial finding"));
    render(<WikiHealth />);
    await screen.findByText("Initial finding");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "stale" } });

    expect(screen.queryByText("Initial finding")).not.toBeInTheDocument();
    expect(screen.getByText("該当する findings はありません。")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__any__" } });
    expect(screen.getByText("Initial finding")).toBeInTheDocument();
    expect(getLintFindings).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(outcomes)(
    "ignores an older $name while a newer findings request is loading",
    async ({ settle }) => {
      const older = deferred<FindingsResponse>();
      const latest = deferred<FindingsResponse>();
      vi.mocked(getLintFindings)
        .mockResolvedValueOnce(response("Retained finding"))
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(latest.promise);
      render(<WikiHealth />);
      await screen.findByText("Retained finding");

      fireEvent.click(screen.getByRole("button", { name: "解決" }));
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: "解決" }));
      await act(async () => {});
      expect(resolveLintFinding).toHaveBeenNthCalledWith(1, "finding-1");
      expect(resolveLintFinding).toHaveBeenNthCalledWith(2, "finding-1");
      expect(getLintFindings).toHaveBeenCalledTimes(3);
      await act(async () => {
        settle(older, response("Stale finding"));
      });

      expect(screen.getByText("Retained finding")).toBeInTheDocument();
      expect(screen.queryByText("Stale finding")).not.toBeInTheDocument();
      expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Lint 実行" })).toBeDisabled();
      await act(async () => latest.resolve(response("Latest finding")));
      expect(screen.getByText("Latest finding")).toBeInTheDocument();
      expect(screen.queryByText("Retained finding")).not.toBeInTheDocument();
      expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
    },
  );

  it("does not replace the latest findings when an older list request finishes later", async () => {
    const older = deferred<FindingsResponse>();
    vi.mocked(getLintFindings)
      .mockResolvedValueOnce(response("Initial finding"))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(response("Latest finding"));
    render(<WikiHealth />);
    await screen.findByText("Initial finding");
    fireEvent.click(screen.getByRole("button", { name: "解決" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "解決" }));
    await screen.findByText("Latest finding");

    await act(async () => older.resolve(response("Stale finding")));

    expect(screen.getByText("Latest finding")).toBeInTheDocument();
    expect(screen.queryByText("Stale finding")).not.toBeInTheDocument();
    expect(getLintFindings).toHaveBeenCalledTimes(3);
  });

  it.each(outcomes)(
    "can unmount before a pending $name without starting another request",
    async ({ settle }) => {
      const pending = deferred<FindingsResponse>();
      vi.mocked(getLintFindings).mockReturnValue(pending.promise);
      const { unmount, container } = render(<WikiHealth />);

      unmount();
      await act(async () => {
        settle(pending, response("Unmounted finding"));
      });

      expect(container).toBeEmptyDOMElement();
      expect(getLintFindings).toHaveBeenCalledTimes(1);
    },
  );
});
