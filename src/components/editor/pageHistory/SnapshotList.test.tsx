/**
 * SnapshotList コンポーネントのテスト
 * Tests for the SnapshotList component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnapshotList } from "./SnapshotList";
import type { PageSnapshot } from "@/types/pageSnapshot";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "editor.pageHistory.noSnapshots": "スナップショットなし",
        "editor.pageHistory.noSnapshotsDescription": "まだ履歴がありません",
        "editor.pageHistory.auto": "自動",
        "editor.pageHistory.restore": "復元",
      };
      if (key === "editor.pageHistory.version" && params?.version != null) {
        return `v${params.version}`;
      }
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@/lib/dateUtils", () => ({
  formatTimeAgo: (ts: number) => `formatted:${ts}`,
}));

vi.mock("@zedi/ui", () => ({
  ScrollArea: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="scroll-area" {...props}>
      {children}
    </div>
  ),
  Badge: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

function createSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    id: "snap-1",
    version: 1,
    contentText: "test content",
    createdBy: "user-1",
    createdByEmail: "user@example.com",
    trigger: "auto",
    createdAt: "2026-04-07T12:00:00Z",
    ...overrides,
  };
}

describe("SnapshotList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("スナップショットがない場合、空メッセージを表示する / shows empty message when no snapshots", () => {
    render(<SnapshotList snapshots={[]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("スナップショットなし")).toBeInTheDocument();
    expect(screen.getByText("まだ履歴がありません")).toBeInTheDocument();
  });

  it("スナップショット一覧を表示する / renders snapshot items", () => {
    const snapshots = [
      createSnapshot({ id: "s1", version: 3 }),
      createSnapshot({ id: "s2", version: 2, trigger: "restore", createdByEmail: null }),
    ];

    render(<SnapshotList snapshots={snapshots} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("選択中のスナップショットにはスタイルが適用される / selected item has primary border", () => {
    const snapshots = [createSnapshot({ id: "s1" })];

    const { container } = render(
      <SnapshotList snapshots={snapshots} selectedId="s1" onSelect={vi.fn()} />,
    );

    const button = container.querySelector("button");
    expect(button?.className).toContain("border-primary");
  });

  it("クリックすると onSelect が呼ばれる / calls onSelect on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const snap = createSnapshot({ id: "s1", version: 5 });

    render(<SnapshotList snapshots={[snap]} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByText("v5"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(snap);
  });

  it("createdByEmail がある場合に表示する / shows email when available", () => {
    const snap = createSnapshot({ createdByEmail: "test@example.com" });

    render(<SnapshotList snapshots={[snap]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("createdByEmail がない場合は表示しない / hides email when null", () => {
    const snap = createSnapshot({ createdByEmail: null });

    render(<SnapshotList snapshots={[snap]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });
});
