import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorsContent } from "./ErrorsContent";
import type { ApiErrorRow } from "@/api/admin";

vi.mock("@zedi/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectValue: () => null,
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("@/lib/dateUtils", () => ({
  formatDate: (d: string) => d,
  formatNumber: (n: number) => n.toLocaleString("ja-JP"),
  getActiveLocale: () => "ja-JP" as const,
}));

const baseRow: ApiErrorRow = {
  id: "00000000-0000-0000-0000-000000000001",
  sentryIssueId: "sentry-1",
  fingerprint: null,
  title: "TypeError: cannot read properties of null",
  route: "GET /api/users/:id",
  statusCode: 500,
  occurrences: 42,
  firstSeenAt: "2026-05-01T00:00:00Z",
  lastSeenAt: "2026-05-04T00:00:00Z",
  severity: "high",
  status: "open",
  aiSummary: null,
  aiSuspectedFiles: null,
  aiRootCause: null,
  aiSuggestedFix: null,
  githubIssueNumber: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-04T00:00:00Z",
};

const defaultProps = {
  rows: [baseRow],
  total: 1,
  loading: false,
  error: null,
  statusFilter: "all" as const,
  severityFilter: "all" as const,
  onStatusFilterChange: vi.fn(),
  onSeverityFilterChange: vi.fn(),
  onSelect: vi.fn(),
};

describe("ErrorsContent", () => {
  it("renders the page title", () => {
    render(<ErrorsContent {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "API エラー" })).toBeInTheDocument();
  });

  it("shows the empty-state message when rows is empty and not loading", () => {
    render(<ErrorsContent {...defaultProps} rows={[]} total={0} />);
    expect(screen.getByText("対象のエラーはまだ報告されていません。")).toBeInTheDocument();
  });

  it("renders one row with title, route, and occurrences", () => {
    render(<ErrorsContent {...defaultProps} />);
    expect(screen.getByText(baseRow.title)).toBeInTheDocument();
    if (baseRow.route) {
      expect(screen.getByText(baseRow.route)).toBeInTheDocument();
    }
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
  });

  it("invokes onSelect with the row when 詳細を見る is clicked", async () => {
    const onSelect = vi.fn();
    render(<ErrorsContent {...defaultProps} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: "詳細を見る" }));
    expect(onSelect).toHaveBeenCalledWith(baseRow);
  });

  it("renders the loading message when loading and no rows are present yet", () => {
    render(<ErrorsContent {...defaultProps} rows={[]} total={0} loading={true} />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("renders the error message in an alert region", () => {
    render(<ErrorsContent {...defaultProps} error="server is down" />);
    expect(screen.getByRole("alert")).toHaveTextContent("server is down");
  });
});
