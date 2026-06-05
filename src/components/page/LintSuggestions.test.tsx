import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── 依存モック ────────────────────────────────────────────────────
interface FindingLike {
  id: string;
  rule: string;
  severity: string;
  page_ids: string[];
  detail: Record<string, unknown>;
  created_at: string;
}

const queryData: { current: FindingLike[] | undefined } = { current: undefined };

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: queryData.current,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true }),
}));

vi.mock("react-i18next", () => ({
  // 翻訳キーをそのまま返す簡易スタブ。formatDetail / ruleLabel は detail 由来の
  // 文字列を返すので、本テストの検証には十分。
  useTranslation: () => ({ t: (key: string) => key }),
}));

// 依存モック後に import する。Import after mocks so they apply.
import { LintSuggestions } from "./LintSuggestions";

beforeEach(() => {
  queryData.current = undefined;
});

describe("LintSuggestions", () => {
  it("renders the typed detail summary (suggestion) for a finding", () => {
    queryData.current = [
      {
        id: "f1",
        rule: "orphan",
        severity: "warn",
        page_ids: ["p1"],
        detail: { suggestion: "リンクを追加しましょう" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    render(<LintSuggestions pageId="p1" />);
    expect(screen.getByText("リンクを追加しましょう")).toBeInTheDocument();
  });

  it("falls back to JSON.stringify for an unrecognized detail shape", () => {
    queryData.current = [
      {
        id: "f2",
        rule: "conflict",
        severity: "error",
        page_ids: ["p1"],
        detail: { foo: "bar", count: 2 },
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    render(<LintSuggestions pageId="p1" />);
    expect(screen.getByText('{"foo":"bar","count":2}')).toBeInTheDocument();
  });

  it("renders nothing when there are no findings", () => {
    queryData.current = [];
    const { container } = render(<LintSuggestions pageId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
