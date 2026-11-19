/** 監査ログの取得・競合を検証する。 / Verify audit-log loading and request races. */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import AuditLogs from "./index";
import { getAuditLogs, type AuditLogEntry } from "@/api/admin";

vi.mock("@/api/admin", () => ({ getAuditLogs: vi.fn() }));
vi.mock("@zedi/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange: (value: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const row: AuditLogEntry = {
  id: "log-1",
  actorUserId: "admin-1",
  actorEmail: "admin@example.com",
  actorName: "Admin",
  action: "user.role.update",
  targetType: "user",
  targetId: "target-1",
  targetEmail: "target@example.com",
  targetName: "Target",
  before: { role: "user" },
  after: { role: "admin" },
  ipAddress: null,
  userAgent: null,
  createdAt: "2026-04-11T00:00:00Z",
};
type Response = Awaited<ReturnType<typeof getAuditLogs>>;
const response: Response = { logs: [row], total: 100 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getAuditLogs).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}
async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe("AuditLogs", () => {
  it("shows loading before the first response and renders its rows after one request", async () => {
    const pending = deferred<Response>();
    vi.mocked(getAuditLogs).mockReturnValue(pending.promise);

    render(<AuditLogs />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    expect(getAuditLogs).toHaveBeenCalledTimes(1);
    expect(getAuditLogs).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      action: undefined,
      from: undefined,
      to: undefined,
    });
    await act(async () => {
      pending.resolve(response);
    });
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
  });

  it("uses the latest debounced date and action filters and resets the page", async () => {
    vi.mocked(getAuditLogs).mockResolvedValue(response);
    render(<AuditLogs />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    await settle();
    expect(getAuditLogs).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 50,
      action: undefined,
      from: undefined,
      to: undefined,
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "user.role.update" } });
    fireEvent.change(screen.getByLabelText("期間（開始）"), {
      target: { value: "2026-04-10T12:00" },
    });
    fireEvent.change(screen.getByLabelText("期間（終了）"), {
      target: { value: "2026-04-11T12:00" },
    });
    expect(getAuditLogs).toHaveBeenCalledTimes(2);
    await debounce();

    expect(getAuditLogs).toHaveBeenCalledTimes(3);
    expect(getAuditLogs).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 0,
      action: "user.role.update",
      from: "2026-04-10T12:00:00.000Z",
      to: "2026-04-11T12:00:00.000Z",
    });
  });

  it("clears a previous load error when a filter starts a new request", async () => {
    const pending = deferred<Response>();
    vi.mocked(getAuditLogs)
      .mockRejectedValueOnce(new Error("audit failed"))
      .mockReturnValueOnce(pending.promise);
    render(<AuditLogs />);
    await settle();
    expect(screen.getByText("audit failed")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "user.role.update" } });
    await debounce();

    expect(screen.queryByText("audit failed")).not.toBeInTheDocument();
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    await act(async () => {
      pending.resolve({ logs: [], total: 0 });
    });
    expect(screen.getByText("監査ログはありません。")).toBeInTheDocument();
    expect(getAuditLogs).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      outcome: "success",
      complete: (request: ReturnType<typeof deferred<Response>>) =>
        request.resolve({ logs: [{ ...row, actorEmail: "old@example.com" }], total: 1 }),
    },
    {
      outcome: "failure",
      complete: (request: ReturnType<typeof deferred<Response>>) =>
        request.reject(new Error("stale failure")),
    },
  ])(
    "ignores stale $outcome and completion while the newest filter request is pending",
    async ({ complete }) => {
      const old = deferred<Response>();
      const current = deferred<Response>();
      vi.mocked(getAuditLogs).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      render(<AuditLogs />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "user.role.update" } });
      await debounce();

      await act(async () => {
        complete(old);
      });
      expect(screen.getByText("読み込み中...")).toBeInTheDocument();
      expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();
      expect(screen.queryByText("stale failure")).not.toBeInTheDocument();
      await act(async () => {
        current.resolve(response);
      });
      expect(screen.getByText("admin@example.com")).toBeInTheDocument();
      expect(getAuditLogs).toHaveBeenCalledTimes(2);
    },
  );

  it("cancels a pending filter debounce on unmount", async () => {
    vi.mocked(getAuditLogs).mockResolvedValue(response);
    const { unmount } = render(<AuditLogs />);
    await settle();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "user.role.update" } });

    unmount();
    await debounce();

    expect(getAuditLogs).toHaveBeenCalledTimes(1);
  });
});
