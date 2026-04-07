/**
 * PageHistoryModal コンポーネントのテスト
 * Tests for the PageHistoryModal component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHistoryModal } from "./PageHistoryModal";
import type { PageSnapshot } from "@/types/pageSnapshot";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockMutateAsync = vi.fn();
const mockSnapshots: PageSnapshot[] = [
  {
    id: "snap-1",
    version: 3,
    contentText: "version 3 text",
    createdBy: "user-1",
    createdByEmail: "user@example.com",
    trigger: "auto",
    createdAt: "2026-04-07T12:00:00Z",
  },
  {
    id: "snap-2",
    version: 2,
    contentText: "version 2 text",
    createdBy: null,
    createdByEmail: null,
    trigger: "auto",
    createdAt: "2026-04-07T11:00:00Z",
  },
];

vi.mock("@/hooks/usePageSnapshotQueries", () => ({
  usePageSnapshots: () => ({ data: mockSnapshots, isLoading: false }),
  usePageSnapshot: (_pageId: string, snapshotId: string | null) => ({
    data: snapshotId
      ? {
          id: snapshotId,
          version: 3,
          ydocState: "base64state",
          contentText: "detail text",
          createdBy: "user-1",
          createdByEmail: "user@example.com",
          trigger: "auto" as const,
          createdAt: "2026-04-07T12:00:00Z",
        }
      : undefined,
    isLoading: false,
  }),
  useRestorePageSnapshot: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "editor.pageHistory.title": "変更履歴",
        "editor.pageHistory.description": "過去のバージョンを確認",
        "editor.pageHistory.selectSnapshot": "スナップショットを選択",
        "editor.pageHistory.preview": "プレビュー",
        "editor.pageHistory.compare": "比較",
        "editor.pageHistory.restoreButton": "復元",
        "editor.pageHistory.restoreConfirmTitle": "復元の確認",
        "editor.pageHistory.restoreConfirmDescription": "この操作は元に戻せません",
        "editor.pageHistory.restoreConfirmCancel": "キャンセル",
        "editor.pageHistory.restoreConfirmAction": "復元する",
        "editor.pageHistory.restoreSuccess": "復元しました",
        "editor.pageHistory.restoreError": "復元に失敗しました",
        "editor.pageHistory.restoring": "復元中...",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("./SnapshotList", () => ({
  SnapshotList: ({
    snapshots,
    onSelect,
  }: {
    snapshots: PageSnapshot[];
    selectedId: string | null;
    onSelect: (snap: PageSnapshot) => void;
  }) => (
    <div data-testid="snapshot-list">
      {snapshots.map((s) => (
        <button key={s.id} data-testid={`snap-item-${s.id}`} onClick={() => onSelect(s)}>
          {`snap-${s.version}`}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./SnapshotPreview", () => ({
  SnapshotPreview: ({ ydocState }: { ydocState: string }) => (
    <div data-testid="snapshot-preview">{ydocState}</div>
  ),
}));

vi.mock("./SnapshotCompare", () => ({
  SnapshotCompare: () => <div data-testid="snapshot-compare">compare view</div>,
}));

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  pageId: "page-123",
  currentYdocState: "current-base64",
  onRestored: vi.fn(),
};

describe("PageHistoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("モーダルが開いているとき、タイトルと説明を表示する / shows title and description when open", () => {
    render(<PageHistoryModal {...defaultProps} />);

    expect(screen.getByText("変更履歴")).toBeInTheDocument();
    expect(screen.getByText("過去のバージョンを確認")).toBeInTheDocument();
  });

  it("スナップショット一覧を表示する / renders snapshot list", () => {
    render(<PageHistoryModal {...defaultProps} />);

    expect(screen.getByTestId("snapshot-list")).toBeInTheDocument();
    expect(screen.getByTestId("snap-item-snap-1")).toBeInTheDocument();
    expect(screen.getByTestId("snap-item-snap-2")).toBeInTheDocument();
  });

  it("未選択時に選択メッセージを表示する / shows select message when no snapshot selected", () => {
    render(<PageHistoryModal {...defaultProps} />);

    expect(screen.getByText("スナップショットを選択")).toBeInTheDocument();
  });

  it("スナップショットを選択するとプレビュータブが表示される / shows preview tab after selecting a snapshot", async () => {
    const user = userEvent.setup();
    render(<PageHistoryModal {...defaultProps} />);

    await user.click(screen.getByTestId("snap-item-snap-1"));

    expect(screen.getByText("プレビュー")).toBeInTheDocument();
    expect(screen.getByText("比較")).toBeInTheDocument();
    expect(screen.getByText("復元")).toBeInTheDocument();
  });

  it("復元ボタンをクリックすると確認ダイアログが表示される / shows confirmation dialog on restore click", async () => {
    const user = userEvent.setup();
    render(<PageHistoryModal {...defaultProps} />);

    // まずスナップショットを選択
    await user.click(screen.getByTestId("snap-item-snap-1"));

    // 復元ボタンをクリック
    await user.click(screen.getByText("復元"));

    // 確認ダイアログが表示される
    expect(screen.getByText("復元の確認")).toBeInTheDocument();
    expect(screen.getByText("この操作は元に戻せません")).toBeInTheDocument();
  });

  it("確認ダイアログで復元を実行すると mutateAsync が呼ばれる / calls mutateAsync on confirm", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValueOnce({ version: 4, snapshot_id: "snap-new" });

    render(<PageHistoryModal {...defaultProps} />);

    await user.click(screen.getByTestId("snap-item-snap-1"));
    await user.click(screen.getByText("復元"));
    await user.click(screen.getByText("復元する"));

    expect(mockMutateAsync).toHaveBeenCalledWith("snap-1");
  });
});
