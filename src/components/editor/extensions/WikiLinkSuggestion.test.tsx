import React, { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WikiLinkSuggestion,
  type WikiLinkSuggestionHandle,
  type WikiLinkSuggestionPage,
  type SuggestionItem,
} from "./WikiLinkSuggestion";

/**
 * 入力バー（#924 §2）と本文中 `[[` サジェスト（#925）両方で再利用される
 * 共通コンポーネントとしての受け入れ条件をテストする。マウント位置や
 * 呼び出し元コンテキスト（Editor / range）に依存しない pure presentation
 * であることを保証する。
 *
 * Locks in the contract of the shared `WikiLinkSuggestion` component used
 * by both the FAB input bar (#924 §2) and the in-body `[[` suggestion
 * popup (#925). The component must remain mount-agnostic — no Editor or
 * range coupling — so the same instance can be wrapped by either host.
 */

function makePage(overrides: Partial<WikiLinkSuggestionPage> = {}): WikiLinkSuggestionPage {
  return {
    id: overrides.id ?? "p-1",
    title: overrides.title ?? "Untitled",
    isDeleted: overrides.isDeleted ?? false,
  };
}

/**
 * `useImperativeHandle` 経由の `onKeyDown` を呼び出すヘルパ。
 * Helper to invoke the imperative `onKeyDown` exposed via the ref.
 */
function fireKey(ref: React.RefObject<WikiLinkSuggestionHandle | null>, key: string): boolean {
  const handle = ref.current;
  if (!handle) throw new Error("WikiLinkSuggestion ref is not attached");
  let handled = false;
  act(() => {
    handled = handle.onKeyDown(new KeyboardEvent("keydown", { key }));
  });
  return handled;
}

describe("WikiLinkSuggestion - 候補の描画 / item rendering", () => {
  it("既存ページ候補をクエリに一致した順に最大 5 件まで描画する / renders up to 5 matching pages", () => {
    const pages: WikiLinkSuggestionPage[] = [
      makePage({ id: "p-1", title: "Alpha" }),
      makePage({ id: "p-2", title: "Beta" }),
      makePage({ id: "p-3", title: "Gamma" }),
      makePage({ id: "p-4", title: "Delta" }),
      makePage({ id: "p-5", title: "Epsilon" }),
      makePage({ id: "p-6", title: "Zeta" }),
    ];

    render(<WikiLinkSuggestion query="" onSelect={vi.fn()} onClose={vi.fn()} pages={pages} />);

    // 6 件あっても "create new" を入れずに 5 件で打ち切る。
    // With 6 candidates and an empty query, exactly the first 5 are shown.
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Zeta")).not.toBeInTheDocument();
  });

  it("クエリに一致しないページは表示しない / filters by query (case-insensitive substring)", () => {
    const pages = [
      makePage({ id: "p-1", title: "React Hooks" }),
      makePage({ id: "p-2", title: "TypeScript Guide" }),
    ];

    render(<WikiLinkSuggestion query="react" onSelect={vi.fn()} onClose={vi.fn()} pages={pages} />);

    expect(screen.getByText("React Hooks")).toBeInTheDocument();
    expect(screen.queryByText("TypeScript Guide")).not.toBeInTheDocument();
  });

  it("isDeleted のページは候補から除外する / excludes deleted pages", () => {
    const pages = [
      makePage({ id: "p-1", title: "Active" }),
      makePage({ id: "p-2", title: "Archived", isDeleted: true }),
    ];

    render(<WikiLinkSuggestion query="" onSelect={vi.fn()} onClose={vi.fn()} pages={pages} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("完全一致が無い場合は『新規作成』エントリを末尾に追加する / appends a create entry when no exact match", () => {
    const pages = [makePage({ id: "p-1", title: "Existing" })];

    render(
      <WikiLinkSuggestion query="New Page" onSelect={vi.fn()} onClose={vi.fn()} pages={pages} />,
    );

    expect(screen.getByText('"New Page" を作成')).toBeInTheDocument();
  });

  it("完全一致するページがあれば『新規作成』エントリは出さない / hides create entry on exact title match", () => {
    const pages = [makePage({ id: "p-1", title: "Alpha" })];

    render(<WikiLinkSuggestion query="Alpha" onSelect={vi.fn()} onClose={vi.fn()} pages={pages} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText(/を作成$/)).not.toBeInTheDocument();
  });

  it("候補も新規作成エントリも無いときは null を返す / renders nothing with no items", () => {
    const { container } = render(
      <WikiLinkSuggestion query="" onSelect={vi.fn()} onClose={vi.fn()} pages={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("ポジショニング class を一切付けない（マウント位置は呼び出し側の責務）/ does not impose absolute/fixed positioning", () => {
    render(
      <WikiLinkSuggestion
        query=""
        onSelect={vi.fn()}
        onClose={vi.fn()}
        pages={[makePage({ title: "Alpha" })]}
      />,
    );

    // ルート要素に position 系のクラスを持たないことを確認する。これにより
    // 入力バー（fixed）と本文中 `[[`（absolute）どちらの host にも適合する。
    // The root must not carry position classes so it can be wrapped in
    // either the input bar's `fixed` container or the editor's `absolute`
    // overlay without bleeding through.
    const root = screen.getByTestId("wiki-link-suggestion");
    expect(root.className).not.toMatch(/\b(absolute|fixed|relative|sticky)\b/);
  });
});

describe("WikiLinkSuggestion - 確定 / キーボード操作 / selection + keyboard", () => {
  it("クリックで onSelect に対応する item が渡る / clicking a row fires onSelect with that item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(item: SuggestionItem) => void>();
    const pages = [makePage({ id: "p-1", title: "Alpha" }), makePage({ id: "p-2", title: "Beta" })];

    render(<WikiLinkSuggestion query="" onSelect={onSelect} onClose={vi.fn()} pages={pages} />);

    await user.click(screen.getByText("Beta"));
    expect(onSelect).toHaveBeenCalledWith({ id: "p-2", title: "Beta", exists: true });
  });

  it("新規作成行をクリックすると exists=false の item が渡る / clicking create row fires create item", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(item: SuggestionItem) => void>();
    render(<WikiLinkSuggestion query="Fresh" onSelect={onSelect} onClose={vi.fn()} pages={[]} />);

    await user.click(screen.getByText('"Fresh" を作成'));
    expect(onSelect).toHaveBeenCalledWith({ id: "create-new", title: "Fresh", exists: false });
  });

  it("ArrowDown / ArrowUp で選択行が循環する / ArrowDown and ArrowUp wrap around the list", async () => {
    const ref = createRef<WikiLinkSuggestionHandle>();
    const onSelect = vi.fn<(item: SuggestionItem) => void>();
    const pages = [makePage({ id: "p-1", title: "Alpha" }), makePage({ id: "p-2", title: "Beta" })];

    render(
      <WikiLinkSuggestion ref={ref} query="" onSelect={onSelect} onClose={vi.fn()} pages={pages} />,
    );
    // 初回マウント時の選択状態が確定する（先頭行に `bg-accent` が付く）まで待つ。
    // `queueMicrotask` などの内部実装に依存せず、観測可能な副作用で同期する。
    // Wait for the initial selection to settle by observing the highlight
    // class on the first row, avoiding coupling to the internal
    // `queueMicrotask` mechanism (gemini / CodeRabbit review feedback).
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons[0].className).toMatch(/\bbg-accent\b/);
    });

    // 最初は先頭が選択されている。Enter で確定して確認。
    // First item highlighted initially; confirm by pressing Enter.
    expect(fireKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({ id: "p-1", title: "Alpha", exists: true });

    // ArrowDown で 2 番目へ。
    // ArrowDown moves selection to the second row.
    expect(fireKey(ref, "ArrowDown")).toBe(true);
    expect(fireKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({ id: "p-2", title: "Beta", exists: true });

    // 末尾で ArrowDown すると先頭に戻る（循環）。
    // ArrowDown from last item wraps back to the first row.
    expect(fireKey(ref, "ArrowDown")).toBe(true);
    expect(fireKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({ id: "p-1", title: "Alpha", exists: true });

    // 先頭で ArrowUp すると末尾に飛ぶ。
    // ArrowUp from first item wraps to the last row.
    expect(fireKey(ref, "ArrowUp")).toBe(true);
    expect(fireKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({ id: "p-2", title: "Beta", exists: true });
  });

  it("Escape で onClose が呼ばれる / Escape closes the popup", () => {
    const ref = createRef<WikiLinkSuggestionHandle>();
    const onClose = vi.fn();
    render(
      <WikiLinkSuggestion
        ref={ref}
        query=""
        onSelect={vi.fn()}
        onClose={onClose}
        pages={[makePage()]}
      />,
    );

    expect(fireKey(ref, "Escape")).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("未処理のキーでは false を返し既定挙動を妨げない / returns false for unhandled keys", () => {
    const ref = createRef<WikiLinkSuggestionHandle>();
    render(
      <WikiLinkSuggestion
        ref={ref}
        query=""
        onSelect={vi.fn()}
        onClose={vi.fn()}
        pages={[makePage()]}
      />,
    );

    expect(fireKey(ref, "a")).toBe(false);
    expect(fireKey(ref, "Tab")).toBe(false);
  });
});
