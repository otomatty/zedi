import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@zedi/ui";
import { WikiGeneratorButton } from "./WikiGeneratorButton";

/** Radix Tooltip 配下での描画ヘルパー / Render helper wrapping children with TooltipProvider. */
function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

/**
 * サーバーモード（api_server）でもボタンクリック時に
 * 「APIキーを設定してください」ダイアログが出てしまっていた不具合の回帰テスト。
 *
 * Regression tests for the bug where server-mode users were shown the
 * "please set an API key" dialog even though server mode does not require one.
 */

const mockIsAIConfigured = vi.fn();

vi.mock("@/lib/aiSettings", () => ({
  isAIConfigured: (...args: unknown[]) => mockIsAIConfigured(...args),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/p/1", search: "", hash: "" }),
}));

// `@zedi/ui` Tooltip/Dialog primitives render their children directly in test
// environment; use the real implementation so we can query DOM.

describe("WikiGeneratorButton", () => {
  const defaultProps = {
    title: "テストページ",
    hasContent: false,
    onGenerate: vi.fn(),
    status: "idle" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("回帰: isAIConfigured が true なら onGenerate を呼び、ダイアログを出さない", async () => {
    // サーバーモードの既存ユーザーが生成ボタンを押した際の正常系。
    // Happy path: server-mode user clicking the generate button.
    mockIsAIConfigured.mockResolvedValue(true);
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<WikiGeneratorButton {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: /Wiki生成/ }));

    expect(mockIsAIConfigured).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    // "AI設定が必要です" ダイアログは表示されない。
    // The "AI is not configured" dialog must not be shown.
    expect(screen.queryByText("AI設定が必要です")).not.toBeInTheDocument();
  });

  it("isAIConfigured が false ならダイアログを出し、onGenerate は呼ばない", async () => {
    mockIsAIConfigured.mockResolvedValue(false);
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<WikiGeneratorButton {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: /Wiki生成/ }));

    expect(onGenerate).not.toHaveBeenCalled();
    expect(await screen.findByText("AI設定が必要です")).toBeInTheDocument();
  });

  it("タイトルが空ならボタンを描画しない", () => {
    renderWithProviders(<WikiGeneratorButton {...defaultProps} title="" />);
    expect(screen.queryByRole("button", { name: /Wiki生成/ })).not.toBeInTheDocument();
  });

  it("本文がある場合はボタンを描画しない", () => {
    renderWithProviders(<WikiGeneratorButton {...defaultProps} hasContent={true} />);
    expect(screen.queryByRole("button", { name: /Wiki生成/ })).not.toBeInTheDocument();
  });
});
