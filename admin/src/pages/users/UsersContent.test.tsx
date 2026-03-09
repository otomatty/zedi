import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersContent } from "./UsersContent";
import type { UserAdmin } from "@/api/admin";

vi.mock("@zedi/ui", () => ({
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
  Select: ({ children }: { children: React.ReactNode }) => <div data-select-root>{children}</div>,
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

vi.mock("@/lib/dateUtils", () => ({
  formatDate: (d: string) => d,
}));

const mockUser: UserAdmin = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  role: "user",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("UsersContent", () => {
  it("shows range and total when users are loaded", () => {
    const onPageChange = vi.fn();
    render(
      <UsersContent
        users={[mockUser]}
        total={1}
        page={0}
        pageSize={50}
        search=""
        onSearchChange={vi.fn()}
        onPageChange={onPageChange}
        error={null}
        loading={false}
        savingIds={new Set()}
        onRoleChange={vi.fn()}
      />,
    );

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
      <UsersContent
        users={users}
        total={100}
        page={0}
        pageSize={50}
        search=""
        onSearchChange={vi.fn()}
        onPageChange={onPageChange}
        error={null}
        loading={false}
        savingIds={new Set()}
        onRoleChange={vi.fn()}
      />,
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
        users={users}
        total={100}
        page={1}
        pageSize={50}
        search=""
        onSearchChange={vi.fn()}
        onPageChange={onPageChange}
        error={null}
        loading={false}
        savingIds={new Set()}
        onRoleChange={vi.fn()}
      />,
    );

    const prevButton = screen.getByRole("button", { name: "前へ" });
    await userEvent.click(prevButton);
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it("does not show pagination when total <= pageSize", () => {
    render(
      <UsersContent
        users={[mockUser]}
        total={50}
        page={0}
        pageSize={50}
        search=""
        onSearchChange={vi.fn()}
        onPageChange={vi.fn()}
        error={null}
        loading={false}
        savingIds={new Set()}
        onRoleChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "次へ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "前へ" })).not.toBeInTheDocument();
  });
});
