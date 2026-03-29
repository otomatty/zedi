/**
 * AIChatBranchTree: branch graph with React Flow + dagre.
 * AIChatBranchTree: React Flow + dagre によるブランチグラフ。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatBranchTree } from "./AIChatBranchTree";
import type { MessageMap, TreeChatMessage } from "@/types/aiChat";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const noopBranch = vi.fn();

/** Mock React Flow to avoid canvas/WebGL in jsdom; simulate node clicks. */
vi.mock("@xyflow/react", () => ({
  ReactFlow: ({
    nodes,
    onNodeClick,
  }: {
    nodes: { id: string }[];
    onNodeClick?: (e: unknown, n: { id: string }) => void;
  }) => (
    <div data-testid="react-flow">
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          data-testid={`node-${n.id}`}
          onClick={() => onNodeClick?.({} as React.MouseEvent, n)}
        >
          {n.id}
        </button>
      ))}
    </div>
  ),
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function msg(
  id: string,
  role: TreeChatMessage["role"],
  parentId: string | null,
  timestamp: number,
  content = "",
): TreeChatMessage {
  return { id, role, parentId, content, timestamp };
}

describe("AIChatBranchTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows noBranches when messageMap is empty", () => {
    const onSelectBranch = vi.fn();
    render(
      <AIChatBranchTree
        messageMap={{}}
        rootMessageId="u1"
        activeLeafId={null}
        onSelectBranch={onSelectBranch}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    expect(screen.getByText("aiChat.viewTabs.noBranches")).toBeInTheDocument();
    expect(screen.queryByTestId("react-flow")).not.toBeInTheDocument();
  });

  it("shows noBranches when rootMessageId is null", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
    };
    render(
      <AIChatBranchTree
        messageMap={map}
        rootMessageId={null}
        activeLeafId={null}
        onSelectBranch={vi.fn()}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    expect(screen.getByText("aiChat.viewTabs.noBranches")).toBeInTheDocument();
  });

  it("renders ReactFlow with nodes for linear tree", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    render(
      <AIChatBranchTree
        messageMap={map}
        rootMessageId="u1"
        activeLeafId="a1"
        onSelectBranch={vi.fn()}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByTestId("node-u1")).toBeInTheDocument();
    expect(screen.getByTestId("node-a1")).toBeInTheDocument();
  });

  it("renders ReactFlow with nodes for branched tree", () => {
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      a1b: msg("a1b", "assistant", "u1", 3),
      u2: msg("u2", "user", "a1b", 4),
    };
    render(
      <AIChatBranchTree
        messageMap={map}
        rootMessageId="u1"
        activeLeafId="u2"
        onSelectBranch={vi.fn()}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
    expect(screen.getByTestId("node-u1")).toBeInTheDocument();
    expect(screen.getByTestId("node-a1")).toBeInTheDocument();
    expect(screen.getByTestId("node-a1b")).toBeInTheDocument();
    expect(screen.getByTestId("node-u2")).toBeInTheDocument();
  });

  it("calls onSelectBranch with leaf id when node on branch is clicked", async () => {
    const user = userEvent.setup();
    const onSelectBranch = vi.fn();
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
      a1b: msg("a1b", "assistant", "u1", 3),
      u2: msg("u2", "user", "a1b", 4),
    };
    render(
      <AIChatBranchTree
        messageMap={map}
        rootMessageId="u1"
        activeLeafId="a1"
        onSelectBranch={onSelectBranch}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    // Click a1b (mid-node on other branch); leaf for a1b is u2
    await user.click(screen.getByTestId("node-a1b"));
    expect(onSelectBranch).toHaveBeenCalledWith("u2");
  });

  it("calls onSelectBranch with same id when leaf node is clicked", async () => {
    const user = userEvent.setup();
    const onSelectBranch = vi.fn();
    const map: MessageMap = {
      u1: msg("u1", "user", null, 1),
      a1: msg("a1", "assistant", "u1", 2),
    };
    render(
      <AIChatBranchTree
        messageMap={map}
        rootMessageId="u1"
        activeLeafId="a1"
        onSelectBranch={onSelectBranch}
        onBranchFrom={noopBranch}
        onDeleteBranch={noopBranch}
      />,
    );
    await user.click(screen.getByTestId("node-a1"));
    expect(onSelectBranch).toHaveBeenCalledWith("a1");
  });
});
