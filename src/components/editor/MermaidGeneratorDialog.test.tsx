import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import type { MermaidGeneratorStatus } from "@/hooks/useMermaidGenerator";
import { MermaidGeneratorDialog } from "./MermaidGeneratorDialog";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockUseMermaidGenerator: {
  status: MermaidGeneratorStatus;
  result: { code: string } | null;
  error: Error | null;
  isAIConfigured: boolean;
  generate: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  checkAIConfigured: ReturnType<typeof vi.fn>;
} = {
  status: "idle",
  result: null,
  error: null,
  isAIConfigured: true,
  generate: vi.fn(),
  reset: vi.fn(),
  checkAIConfigured: vi.fn(),
};

vi.mock("@/hooks/useMermaidGenerator", () => ({
  useMermaidGenerator: () => mockUseMermaidGenerator,
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue({ svg: "<svg></svg>" }),
  },
}));

function renderDialog(props: { open?: boolean; selectedText?: string } = {}) {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    selectedText: "sample text",
    onInsert: vi.fn(),
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <MermaidGeneratorDialog {...defaultProps} {...props} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("MermaidGeneratorDialog", () => {
  beforeEach(() => {
    void i18n.changeLanguage("ja");
    vi.clearAllMocks();
    mockUseMermaidGenerator.status = "idle";
    mockUseMermaidGenerator.result = null;
    mockUseMermaidGenerator.error = null;
    mockUseMermaidGenerator.isAIConfigured = true;
  });

  it("renders main dialog when AI is configured", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Mermaidダイアグラムを生成" })).toBeInTheDocument();
    expect(screen.getByText("sample text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ダイアグラムを生成" })).toBeInTheDocument();
  });

  it("renders not-configured view when isAIConfigured is false", () => {
    mockUseMermaidGenerator.isAIConfigured = false;
    renderDialog();
    expect(screen.getByRole("heading", { name: /AI設定が必要/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定画面へ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ダイアグラムを生成" })).not.toBeInTheDocument();
  });

  it("calls checkAIConfigured and reset when dialog opens", () => {
    renderDialog({ open: true });
    expect(mockUseMermaidGenerator.checkAIConfigured).toHaveBeenCalled();
    expect(mockUseMermaidGenerator.reset).toHaveBeenCalled();
  });

  it("calls generate with selectedText and selectedTypes when ダイアグラムを生成 is clicked", async () => {
    const user = userEvent.setup();
    renderDialog({ selectedText: "input text" });
    await user.click(screen.getByRole("button", { name: "ダイアグラムを生成" }));
    expect(mockUseMermaidGenerator.generate).toHaveBeenCalledWith(
      "input text",
      expect.arrayContaining(["flowchart"]),
    );
  });

  it("calls onInsert and onOpenChange when 挿入 is clicked after completion", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const onOpenChange = vi.fn();
    mockUseMermaidGenerator.status = "completed";
    mockUseMermaidGenerator.result = { code: "flowchart TD\n  A --> B" };
    // mermaid module is mocked above so preview generation does not run; test only verifies insert/close

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <MermaidGeneratorDialog
            open={true}
            onOpenChange={onOpenChange}
            selectedText="text"
            onInsert={onInsert}
          />
        </MemoryRouter>
      </I18nextProvider>,
    );

    await user.click(screen.getByRole("button", { name: "挿入" }));

    expect(onInsert).toHaveBeenCalledWith("flowchart TD\n  A --> B");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("navigates to settings when goToSettings is clicked in not-configured view", async () => {
    const user = userEvent.setup();
    mockUseMermaidGenerator.isAIConfigured = false;
    renderDialog();

    await user.click(screen.getByRole("button", { name: "設定画面へ" }));

    const navigateUrl = mockNavigate.mock.calls[0][0];
    expect(navigateUrl).toContain("/settings?");
    expect(navigateUrl).toMatch(/section=ai/);
    expect(navigateUrl).toMatch(/returnTo=/);
  });
});
