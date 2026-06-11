import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    onOpenChange,
  }: {
    open: boolean;
    title: string;
    confirmLabel?: string;
    onOpenChange?: (open: boolean) => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid={`confirm-dialog-${title}`}>
        <span data-testid="confirm-dialog-title">{title}</span>
        <button type="button" data-testid={`confirm-btn-${title}`}>
          {confirmLabel ?? "確認"}
        </button>
        <button
          type="button"
          data-testid={`cancel-dialog-${title}`}
          onClick={() => onOpenChange?.(false)}
        >
          cancel
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
  // Mirror the real ja-JP behaviour (the test setup forces ja) so the
  // existing "1,234" assertion below stays meaningful.
  // 実装は ja のときカンマ区切りになる。テスト setup が ja を強制しているため、
  // 既存アサーション "1,234" がそのまま意味を持つよう同等の整形を返す。
  formatNumber: (n: number) => n.toLocaleString("ja-JP"),
  getActiveLocale: () => "ja-JP" as const,
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
  pageCount: 0,
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
  beforeEach(() => {
    selectCallbacks.clear();
    hookRoleChangeTarget = null;
    hookUnsuspendTarget = null;
    hookDeleteTarget = null;
    mockRequestRoleChange.mockClear();
    mockConfirmRoleChange.mockClear();
    mockCancelRoleChange.mockClear();
    mockRequestUnsuspend.mockClear();
    mockConfirmUnsuspend.mockClear();
    mockCancelUnsuspend.mockClear();
    mockRequestDelete.mockClear();
    mockConfirmDelete.mockClear();
    mockCancelDelete.mockClear();
  });

  it("shows error banner when error prop is set", () => {
    render(<UsersContent {...defaultProps} error="something went wrong" />);
    expect(screen.getByText("something went wrong")).toBeInTheDocument();
  });

  it("shows loading state when loading and no users yet", () => {
    render(<UsersContent {...defaultProps} users={[]} total={0} loading={true} />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("calls onSearchChange when search input changes", async () => {
    const onSearchChange = vi.fn();
    render(<UsersContent {...defaultProps} onSearchChange={onSearchChange} />);

    await userEvent.type(screen.getByLabelText("メールで検索"), "a");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("calls onStatusFilterChange when status filter changes", () => {
    const onStatusFilterChange = vi.fn();
    render(<UsersContent {...defaultProps} onStatusFilterChange={onStatusFilterChange} />);

    const statusCallback = selectCallbacks.get("all");
    React.act(() => {
      statusCallback?.("suspended");
    });
    expect(onStatusFilterChange).toHaveBeenCalledWith("suspended");
  });

  it("shows range and total when users are loaded", () => {
    render(<UsersContent {...defaultProps} />);

    expect(screen.getByText(/1-1 件を表示 \/ 合計 1 件/)).toBeInTheDocument();
  });

  it("ユーザーのページ数を表示する / displays the user's page count", () => {
    const userWithPages: UserAdmin = { ...mockUser, pageCount: 1234 };
    render(<UsersContent {...defaultProps} users={[userWithPages]} />);

    expect(screen.getByText("ページ数")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
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

  describe("ステータスバッジと操作ボタン / Status badges and action buttons", () => {
    it("shows suspended status badge", () => {
      const suspendedUser: UserAdmin = {
        ...mockUser,
        status: "suspended",
        suspendedAt: "2026-01-01T00:00:00Z",
        suspendedReason: "short reason",
        suspendedBy: "admin-1",
      };
      render(<UsersContent {...defaultProps} users={[suspendedUser]} />);
      expect(within(screen.getByRole("table")).getByText("suspended")).toBeInTheDocument();
    });

    it("shows deleted status badge and deleted state text", () => {
      const deletedUser: UserAdmin = {
        ...mockUser,
        status: "deleted",
      };
      render(<UsersContent {...defaultProps} users={[deletedUser]} />);
      expect(within(screen.getByRole("table")).getByText("deleted")).toBeInTheDocument();
      expect(screen.getByText("削除済み")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "サスペンド" })).not.toBeInTheDocument();
    });

    it("truncates suspended reason longer than 20 characters", () => {
      const longReason = "abcdefghijklmnopqrstuvwxyz";
      const suspendedUser: UserAdmin = {
        ...mockUser,
        status: "suspended",
        suspendedAt: "2026-01-01T00:00:00Z",
        suspendedReason: longReason,
        suspendedBy: "admin-1",
      };
      render(<UsersContent {...defaultProps} users={[suspendedUser]} />);
      expect(screen.getByText("(abcdefghijklmnopqrst...)")).toBeInTheDocument();
    });

    it("shows suspend and delete buttons for active users", () => {
      render(<UsersContent {...defaultProps} />);
      expect(screen.getByRole("button", { name: "サスペンド" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
    });

    it("calls requestDelete when delete button is clicked", async () => {
      render(<UsersContent {...defaultProps} />);
      await userEvent.click(screen.getByRole("button", { name: "削除" }));
      expect(mockRequestDelete).toHaveBeenCalledWith(mockUser);
    });

    it("shows saving state instead of action buttons", () => {
      render(<UsersContent {...defaultProps} savingIds={new Set([mockUser.id])} />);
      expect(screen.getByText("保存中...")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "サスペンド" })).not.toBeInTheDocument();
    });

    it("shows delete confirmation dialog when deleteTarget is set", () => {
      hookDeleteTarget = { user: mockUser, impact: null, loadingImpact: false };
      render(<UsersContent {...defaultProps} />);
      expect(screen.getByTestId("confirm-dialog-ユーザーを削除")).toBeInTheDocument();
    });

    it("calls cancelRoleChange when role dialog is closed via onOpenChange", async () => {
      hookRoleChangeTarget = { user: mockUser, newRole: "admin" };
      render(<UsersContent {...defaultProps} />);

      await userEvent.click(screen.getByTestId("cancel-dialog-ロールを変更"));
      expect(mockCancelRoleChange).toHaveBeenCalled();
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
