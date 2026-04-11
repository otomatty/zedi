import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLogsContent } from "./AuditLogsContent";
import type { AuditLogEntry } from "@/api/admin";

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
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/lib/dateUtils", () => ({
  formatDate: (d: string) => d,
}));

function buildLog(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
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
    ipAddress: "203.0.113.10",
    userAgent: "vitest/1.0",
    createdAt: "2026-04-11T00:00:00Z",
    ...overrides,
  };
}

describe("AuditLogsContent", () => {
  it("renders header and range/total summary", () => {
    render(
      <AuditLogsContent
        logs={[buildLog()]}
        total={1}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={vi.fn()}
        error={null}
        loading={false}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "監査ログ" })).toBeInTheDocument();
    expect(screen.getByText(/1-1 件を表示 \/ 合計 1 件/)).toBeInTheDocument();
  });

  it("shows 'role: user → admin' summary for user.role.update action", () => {
    render(
      <AuditLogsContent
        logs={[buildLog()]}
        total={1}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={vi.fn()}
        error={null}
        loading={false}
        onPageChange={vi.fn()}
      />,
    );

    // "user → admin" のサマリが少なくとも 1 つ描画されている
    expect(screen.getByText(/user\s*→\s*admin/)).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("target@example.com")).toBeInTheDocument();
  });

  it("shows pagination and calls onPageChange when 次へ is clicked", async () => {
    const onPageChange = vi.fn();
    const logs = Array.from({ length: 10 }, (_, i) => buildLog({ id: `log-${i}` }));

    render(
      <AuditLogsContent
        logs={logs}
        total={100}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={vi.fn()}
        error={null}
        loading={false}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText(/1 \/ 2 ページ/)).toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "次へ" });
    await userEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("renders an empty-state message when logs are empty", () => {
    render(
      <AuditLogsContent
        logs={[]}
        total={0}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={vi.fn()}
        error={null}
        loading={false}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/監査ログはありません/)).toBeInTheDocument();
  });

  it("renders an error banner when error is set", () => {
    render(
      <AuditLogsContent
        logs={[]}
        total={0}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={vi.fn()}
        error="boom"
        loading={false}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("calls onFilterChange when action filter changes", async () => {
    const onFilterChange = vi.fn();
    render(
      <AuditLogsContent
        logs={[]}
        total={0}
        page={0}
        pageSize={50}
        filters={{}}
        onFilterChange={onFilterChange}
        error={null}
        loading={false}
        onPageChange={vi.fn()}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await userEvent.selectOptions(select, "user.role.update");
    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.role.update" }),
    );
  });
});
