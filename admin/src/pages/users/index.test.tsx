import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Users from "./index";
import * as adminApi from "@/api/admin";

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

vi.mock("./UsersContent", () => ({
  UsersContent: ({
    users,
    total,
    page,
    pageSize,
    onPageChange,
    loading,
  }: {
    users: unknown[];
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (p: number) => void;
    loading: boolean;
  }) => (
    <div>
      <span data-testid="users-count">{users.length}</span>
      <span data-testid="total">{total}</span>
      <span data-testid="page">{page}</span>
      <span data-testid="page-size">{pageSize}</span>
      {total > pageSize && (
        <>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0 || loading}
          >
            前へ
          </button>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={loading}>
            次へ
          </button>
        </>
      )}
    </div>
  ),
}));

const mockUsers = (n: number, offset: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `user-${offset + i}`,
    email: `user${offset + i}@example.com`,
    name: `User ${offset + i}`,
    role: "user" as const,
    createdAt: "2026-01-01T00:00:00Z",
  }));

describe("Users (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getUsers with offset 0 on mount", async () => {
    const getUsers = vi.spyOn(adminApi, "getUsers").mockResolvedValue({
      users: mockUsers(10, 0),
      total: 100,
    });

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
});
