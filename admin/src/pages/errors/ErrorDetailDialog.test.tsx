import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorDetailDialog } from "./ErrorDetailDialog";
import type { ApiErrorRow } from "@/api/admin";

vi.mock("@zedi/ui", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="dialog-root" role="dialog" aria-modal="true">
        <button type="button" data-testid="outside-close" onClick={() => onOpenChange(false)}>
          outside
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  Select: ({
    value,
    onValueChange,
    disabled,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      data-testid="status-select"
      id="errors-status-update"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="open">open</option>
      <option value="investigating">investigating</option>
      <option value="resolved">resolved</option>
      <option value="ignored">ignored</option>
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

const baseRow: ApiErrorRow = {
  id: "00000000-0000-0000-0000-000000000001",
  sentryIssueId: "sentry-1",
  fingerprint: null,
  title: "TypeError",
  route: "GET /api/x",
  statusCode: 500,
  occurrences: 1,
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

describe("ErrorDetailDialog", () => {
  const onClose = vi.fn();
  const onUpdateStatus = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    onUpdateStatus.mockClear();
  });

  /**
   * キャンセルで閉じたあと同じ行を再度開いたとき、未保存のステータス選択が残らないこと。
   * Cancel clears pending status so reopening the same row does not show a stale draft.
   */
  it("discards pending status when Cancel is clicked so reopen shows server status", async () => {
    const row = { ...baseRow, status: "open" as const };
    const { rerender } = render(
      <ErrorDetailDialog
        row={row}
        saving={false}
        saveError={null}
        onClose={onClose}
        onUpdateStatus={onUpdateStatus}
      />,
    );

    await userEvent.selectOptions(screen.getByTestId("status-select"), "resolved");
    expect(screen.getByTestId("status-select")).toHaveValue("resolved");

    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <ErrorDetailDialog
        row={null}
        saving={false}
        saveError={null}
        onClose={onClose}
        onUpdateStatus={onUpdateStatus}
      />,
    );

    rerender(
      <ErrorDetailDialog
        row={row}
        saving={false}
        saveError={null}
        onClose={onClose}
        onUpdateStatus={onUpdateStatus}
      />,
    );

    expect(screen.getByTestId("status-select")).toHaveValue("open");
  });
});
