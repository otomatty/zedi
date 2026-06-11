import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Users from "./index";
import * as adminApi from "@/api/admin";
import type { UserAdmin } from "@/api/admin";

const selectCallbacks: Map<string, (v: string) => void> = new Map();

vi.mock("@zedi/ui", () => {
  const AlertDialogContext = React.createContext<{ onOpenChange: (open: boolean) => void } | null>(
    null,
  );

  return {
    AlertDialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
    }) =>
      open ? (
        <AlertDialogContext.Provider value={{ onOpenChange }}>
          <div data-testid="alert-dialog">{children}</div>
        </AlertDialogContext.Provider>
      ) : null,
    AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    AlertDialogCancel: ({
      children,
      disabled,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
    }) => (
      <button type="button" disabled={disabled}>
        {children}
      </button>
    ),
    AlertDialogAction: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      onClick?: (e: React.MouseEvent) => void;
      disabled?: boolean;
    }) => {
      const dialog = React.useContext(AlertDialogContext);
      return (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            onClick?.(e);
            if (!e.defaultPrevented) {
              dialog?.onOpenChange(false);
            }
          }}
        >
          {children}
        </button>
      );
    },
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      onClick,
      disabled,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
    Select: ({
      children,
      onValueChange,
      value,
      disabled,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
      value?: string;
      disabled?: boolean;
    }) => {
      if (onValueChange && value) {
        selectCallbacks.set(value, onValueChange);
      }
      return (
        <div data-select-root data-value={value} data-disabled={disabled}>
          {children}
        </div>
      );
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <option value={value}>{children}</option>
    ),
    SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
      <span {...props}>{children}</span>
    ),
    SelectValue: () => null,
    Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
    TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
    TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
    TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
    TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
    TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  };
});

vi.mock("@zedi/ui/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("./UserCard", () => ({
  UserCard: () => <div data-testid="user-card">UserCard</div>,
}));

const mockUsers = (n: number, offset: number): UserAdmin[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `user-${offset + i}`,
    email: `user${offset + i}@example.com`,
    name: `User ${offset + i}`,
    role: "user" as const,
    status: "active" as const,
    suspendedAt: null,
    suspendedReason: null,
    suspendedBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    pageCount: 0,
  }));

const singleActiveUser: UserAdmin = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  role: "user",
  status: "active",
  suspendedAt: null,
  suspendedReason: null,
  suspendedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  pageCount: 0,
};

function mockListResponse(users: UserAdmin[] = [singleActiveUser], total = users.length) {
  return vi.spyOn(adminApi, "getUsers").mockResolvedValue({ users, total });
}

describe("Users (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallbacks.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls getUsers with offset 0 on mount", async () => {
    const getUsers = mockListResponse(mockUsers(10, 0), 100);

    render(<Users />);

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        }),
      );
    });
  });

  it("calls getUsers with offset 50 when user clicks 次へ", async () => {
    const getUsers = vi
      .spyOn(adminApi, "getUsers")
      .mockResolvedValueOnce({
        users: mockUsers(50, 0),
        total: 100,
      })
      .mockResolvedValueOnce({
        users: mockUsers(50, 50),
        total: 100,
      });

    render(<Users />);

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));
    });

    const nextButton = screen.getByRole("button", { name: "次へ" });
    await userEvent.click(nextButton);

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 50 }));
    });
    expect(getUsers).toHaveBeenCalledTimes(2);
  });

  it("debounces search input before calling getUsers with search param", async () => {
    vi.useFakeTimers();
    const getUsers = mockListResponse();

    render(<Users />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getUsers).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("メールで検索"), { target: { value: "alice" } });
    expect(getUsers).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(getUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "alice",
        offset: 0,
      }),
    );
  });

  it("calls getUsers with status filter when status filter changes", async () => {
    const getUsers = mockListResponse();

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(1));

    const statusCallback = selectCallbacks.get("all");
    expect(statusCallback).toBeDefined();
    React.act(() => {
      statusCallback?.("suspended");
    });

    await waitFor(() => {
      expect(getUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "suspended",
          offset: 0,
        }),
      );
    });
  });

  it("displays load error when getUsers fails", async () => {
    vi.spyOn(adminApi, "getUsers").mockRejectedValueOnce(new Error("load failed"));

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByText("load failed")).toBeInTheDocument();
    });
  });

  it("does not call patchUserRole when role is unchanged", async () => {
    const getUsers = mockListResponse();
    const patchUserRole = vi.spyOn(adminApi, "patchUserRole");

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalled());

    const roleCallback = selectCallbacks.get("user");
    React.act(() => {
      roleCallback?.("user");
    });

    expect(patchUserRole).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "ロールを変更" })).not.toBeInTheDocument();
  });

  it("calls patchUserRole and reloads on successful role change", async () => {
    const getUsers = mockListResponse();
    const patchUserRole = vi.spyOn(adminApi, "patchUserRole").mockResolvedValue({
      user: { ...singleActiveUser, role: "admin" },
    });

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(1));

    React.act(() => {
      selectCallbacks.get("user")?.("admin");
    });
    await userEvent.click(screen.getByRole("button", { name: "変更する" }));

    await waitFor(() => {
      expect(patchUserRole).toHaveBeenCalledWith("user-1", "admin");
    });
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2));
  });

  it("shows error when patchUserRole fails", async () => {
    mockListResponse();
    vi.spyOn(adminApi, "patchUserRole").mockRejectedValueOnce(new Error("role patch failed"));

    render(<Users />);
    await waitFor(() => expect(screen.getByText("user@example.com")).toBeInTheDocument());

    React.act(() => {
      selectCallbacks.get("user")?.("admin");
    });
    await userEvent.click(screen.getByRole("button", { name: "変更する" }));

    await waitFor(() => {
      expect(screen.getByText("role patch failed")).toBeInTheDocument();
    });
  });

  it("calls suspendUser and reloads on successful suspend", async () => {
    const getUsers = mockListResponse();
    const suspendUser = vi.spyOn(adminApi, "suspendUser").mockResolvedValue({
      user: { ...singleActiveUser, status: "suspended" },
    });

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(1));

    const suspendButtons = screen.getAllByRole("button", { name: "サスペンド" });
    expect(suspendButtons.length).toBeGreaterThan(0);
    await userEvent.click(suspendButtons[0] as HTMLElement);
    await userEvent.click(
      within(screen.getByTestId("alert-dialog")).getByRole("button", { name: "サスペンド" }),
    );

    await waitFor(() => {
      expect(suspendUser).toHaveBeenCalledWith("user-1", undefined);
    });
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2));
  });

  it("shows error when suspendUser fails", async () => {
    mockListResponse();
    vi.spyOn(adminApi, "suspendUser").mockRejectedValueOnce(new Error("suspend failed"));

    render(<Users />);
    await waitFor(() => expect(screen.getByText("user@example.com")).toBeInTheDocument());

    const suspendButtons = screen.getAllByRole("button", { name: "サスペンド" });
    expect(suspendButtons.length).toBeGreaterThan(0);
    await userEvent.click(suspendButtons[0] as HTMLElement);
    await userEvent.click(
      within(screen.getByTestId("alert-dialog")).getByRole("button", { name: "サスペンド" }),
    );

    await waitFor(() => {
      expect(screen.getByText("suspend failed")).toBeInTheDocument();
    });
  });

  it("calls unsuspendUser and reloads on successful unsuspend", async () => {
    const suspendedUser: UserAdmin = {
      ...singleActiveUser,
      status: "suspended",
      suspendedAt: "2026-01-01T00:00:00Z",
      suspendedReason: "test",
      suspendedBy: "admin-1",
    };
    const getUsers = mockListResponse([suspendedUser]);
    const unsuspendUser = vi.spyOn(adminApi, "unsuspendUser").mockResolvedValue({
      user: { ...suspendedUser, status: "active" },
    });

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "復活" }));
    await userEvent.click(screen.getByRole("button", { name: "復活させる" }));

    await waitFor(() => {
      expect(unsuspendUser).toHaveBeenCalledWith("user-1");
    });
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2));
  });

  it("shows error when unsuspendUser fails", async () => {
    const suspendedUser: UserAdmin = {
      ...singleActiveUser,
      status: "suspended",
      suspendedAt: "2026-01-01T00:00:00Z",
      suspendedReason: "test",
      suspendedBy: "admin-1",
    };
    mockListResponse([suspendedUser]);
    vi.spyOn(adminApi, "unsuspendUser").mockRejectedValueOnce(new Error("unsuspend failed"));

    render(<Users />);
    await waitFor(() => expect(screen.getByRole("button", { name: "復活" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "復活" }));
    await userEvent.click(screen.getByRole("button", { name: "復活させる" }));

    await waitFor(() => {
      expect(screen.getByText("unsuspend failed")).toBeInTheDocument();
    });
  });

  it("calls deleteUser and reloads on successful delete", async () => {
    const getUsers = mockListResponse();
    vi.spyOn(adminApi, "getUserImpact").mockResolvedValue({
      notesCount: 0,
      sessionsCount: 0,
      activeSubscription: false,
      lastAiUsageAt: null,
    });
    const deleteUser = vi.spyOn(adminApi, "deleteUser").mockResolvedValue({
      user: { ...singleActiveUser, status: "deleted" },
    });

    render(<Users />);
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    await userEvent.type(screen.getByPlaceholderText("user@example.com"), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith("user-1");
    });
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2));
  });

  it("shows error when deleteUser fails", async () => {
    mockListResponse();
    vi.spyOn(adminApi, "getUserImpact").mockResolvedValue({
      notesCount: 0,
      sessionsCount: 0,
      activeSubscription: false,
      lastAiUsageAt: null,
    });
    vi.spyOn(adminApi, "deleteUser").mockRejectedValueOnce(new Error("delete failed"));

    render(<Users />);
    await waitFor(() => expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    await userEvent.type(screen.getByPlaceholderText("user@example.com"), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(screen.getByText("delete failed")).toBeInTheDocument();
    });
  });
});
