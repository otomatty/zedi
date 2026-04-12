import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersContent } from "./UsersContent";
import type { UserAdmin } from "@/api/admin";

// onValueChange をキャプチャして外部からテスト呼び出しできるようにする
// Capture onValueChange callbacks so tests can invoke them directly
const selectCallbacks: Map<string, (v: string) => void> = new Map();

vi.mock("@zedi/ui", () => ({
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
    // aria-label が SelectTrigger 経由で付与される前に、value で区別
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
}));

vi.mock("./UserCard", () => ({
  UserCard: () => <div data-testid="user-card">UserCard</div>,
}));

vi.mock("./SuspendDialog", () => ({
  SuspendDialog: () => null,
}));

vi.mock("@/components/ConfirmActionDialog", () => ({
  ConfirmActionDialog: ({
    open,
    title,
    confirmLabel,
  }: {
    open: boolean;
    title: string;
    confirmLabel?: string;
  }) => {
    if (!open) return null;
    return (
      <div data-testid={`confirm-dialog-${title}`}>
        <span data-testid="confirm-dialog-title">{title}</span>
        <button type="button" data-testid={`confirm-btn-${title}`}>
          {confirmLabel ?? "確認"}
        </button>
      </div>
    );
  },
}));

// useConfirmDialogs のモック / Mock useConfirmDialogs hook
const mockRequestRoleChange = vi.fn();
const mockConfirmRoleChange = vi.fn();
const mockCancelRoleChange = vi.fn();
const mockRequestUnsuspend = vi.fn();
const mockConfirmUnsuspend = vi.fn();
const mockCancelUnsuspend = vi.fn();
const mockRequestDelete = vi.fn();
const mockConfirmDelete = vi.fn();
const mockCancelDelete = vi.fn();

let hookRoleChangeTarget: { user: UserAdmin; newRole: string } | null = null;
let hookUnsuspendTarget: UserAdmin | null = null;
let hookDeleteTarget: { user: UserAdmin; impact: null; loadingImpact: boolean } | null = null;

vi.mock("./useConfirmDialogs", () => ({
  useConfirmDialogs: () => ({
    roleChangeTarget: hookRoleChangeTarget,
    unsuspendTarget: hookUnsuspendTarget,
    deleteTarget: hookDeleteTarget,
    requestRoleChange: mockRequestRoleChange,
    confirmRoleChange: mockConfirmRoleChange,
    cancelRoleChange: mockCancelRoleChange,
    requestUnsuspend: mockRequestUnsuspend,
    confirmUnsuspend: mockConfirmUnsuspend,
    cancelUnsuspend: mockCancelUnsuspend,
    requestDelete: mockRequestDelete,
    confirmDelete: mockConfirmDelete,
    cancelDelete: mockCancelDelete,
  }),
}));

vi.mock("@/lib/dateUtils", () => ({
  formatDate: (d: string) => d,
}));

const mockUser: UserAdmin = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  role: "user",
  status: "active",
  suspendedAt: null,
  suspendedReason: null,
  suspendedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const defaultProps = {
  users: [mockUser],
  total: 1,
  page: 0,
  pageSize: 50,
  search: "",
  statusFilter: "all" as const,
  onSearchChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onPageChange: vi.fn(),
  error: null,
  loading: false,
  savingIds: new Set<string>(),
  onRoleChange: vi.fn(),
  onSuspend: vi.fn(),
  onUnsuspend: vi.fn(),
  onDelete: vi.fn(),
};

describe("UsersContent", () => {
  it("shows range and total when users are loaded", () => {
    render(<UsersContent {...defaultProps} />);

    expect(screen.getByText(/1-1 件を表示 \/ 合計 1 件/)).toBeInTheDocument();
  });

  it("shows pagination when total > pageSize and calls onPageChange when 次へ is clicked", async () => {
    const onPageChange = vi.fn();
    const users = Array.from({ length: 10 }, (_, i) => ({
      ...mockUser,
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    render(
      <UsersContent {...defaultProps} users={users} total={100} onPageChange={onPageChange} />,
    );

    expect(screen.getByText(/1 \/ 2 ページ/)).toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "次へ" });
    expect(nextButton).toBeInTheDocument();

    await userEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange(page - 1) when 前へ is clicked on second page", async () => {
    const onPageChange = vi.fn();
    const users = Array.from({ length: 10 }, (_, i) => ({
      ...mockUser,
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    render(
      <UsersContent
        {...defaultProps}
        users={users}
        total={100}
        page={1}
        onPageChange={onPageChange}
      />,
    );

    const prevButton = screen.getByRole("button", { name: "前へ" });
    await userEvent.click(prevButton);
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it("does not show pagination when total <= pageSize", () => {
    render(<UsersContent {...defaultProps} total={50} />);

    expect(screen.queryByRole("button", { name: "次へ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "前へ" })).not.toBeInTheDocument();
  });

  describe("ロール変更確認ダイアログ / Role change confirmation", () => {
    it("ロール変更時に requestRoleChange を呼ぶ / calls requestRoleChange on role change", () => {
      render(<UsersContent {...defaultProps} />);

      // モック Select の onValueChange を直接呼ぶ / Invoke captured role Select callback
      const roleCallback = selectCallbacks.get("user");
      expect(roleCallback).toBeDefined();
      React.act(() => {
        if (roleCallback) roleCallback("admin");
      });

      expect(mockRequestRoleChange).toHaveBeenCalledWith(mockUser, "admin");
    });

    it("roleChangeTarget があるとき確認ダイアログを表示する / shows dialog when roleChangeTarget is set", () => {
      hookRoleChangeTarget = { user: mockUser, newRole: "admin" };
      render(<UsersContent {...defaultProps} />);

      expect(screen.getByTestId("confirm-dialog-ロールを変更")).toBeInTheDocument();
      hookRoleChangeTarget = null;
    });

    it("roleChangeTarget が null のとき確認ダイアログを表示しない / hides dialog when target is null", () => {
      hookRoleChangeTarget = null;
      render(<UsersContent {...defaultProps} />);

      expect(screen.queryByTestId("confirm-dialog-ロールを変更")).not.toBeInTheDocument();
    });
  });

  describe("サスペンド解除確認ダイアログ / Unsuspend confirmation", () => {
    const suspendedUser: UserAdmin = {
      ...mockUser,
      id: "user-suspended",
      status: "suspended",
      suspendedAt: "2026-01-01T00:00:00Z",
      suspendedReason: "test reason",
      suspendedBy: "admin-1",
    };

    it("復活ボタンクリックで requestUnsuspend を呼ぶ / calls requestUnsuspend when clicking unsuspend", async () => {
      render(<UsersContent {...defaultProps} users={[suspendedUser]} />);

      const unsuspendButton = screen.getByRole("button", { name: "復活" });
      await userEvent.click(unsuspendButton);

      expect(mockRequestUnsuspend).toHaveBeenCalledWith(suspendedUser);
    });

    it("unsuspendTarget があるとき確認ダイアログを表示する / shows dialog when unsuspendTarget is set", () => {
      hookUnsuspendTarget = suspendedUser;
      render(<UsersContent {...defaultProps} users={[suspendedUser]} />);

      expect(screen.getByTestId("confirm-dialog-サスペンドを解除")).toBeInTheDocument();
      hookUnsuspendTarget = null;
    });
  });
});
