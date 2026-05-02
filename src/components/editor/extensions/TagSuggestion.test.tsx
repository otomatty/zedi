/**
 * Tests for the `#name` suggestion popover (issue #767 Phase 2).
 * `#name` 用サジェストポップオーバーのテスト（issue #767 Phase 2）。
 *
 * Pins the popup's items-list contract — especially the regression captured
 * in the gemini-code-assist review on PR #778: an exact match must remain
 * selectable even when more than `MAX_VISIBLE` candidates contain the query
 * substring. Without the prioritising sort, the exact match was sliced off
 * the visible list while still suppressing the "create new" fallback.
 *
 * gemini-code-assist の PR #778 レビュー指摘（完全一致候補が `MAX_VISIBLE` を
 * 超えると表示から漏れる一方で「新規作成」項目も追加されず、ユーザが選べない
 * 状態になる）を再発させないテストを置く。
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import { TagSuggestion, type TagSuggestionHandle } from "./TagSuggestion";
import type { TagSuggestionCandidate } from "@/hooks/useTagCandidates";

/**
 * 矢印キーの状態更新後に ref.current を最新の handle に追従させるためのヘルパー。
 * `setSelectedIndex` は再レンダーをスケジュールし、その後に
 * `useImperativeHandle` が ref を差し替える。`act` で同期 flush することで
 * 次の pressKey が新しいクロージャに当たる。
 *
 * Helper that flushes the re-render scheduled by `setSelectedIndex` so the
 * next `ref.current?.onKeyDown` call sees the updated imperative handle.
 */
function pressKey(ref: RefObject<TagSuggestionHandle | null>, key: string): boolean | undefined {
  let handled: boolean | undefined;
  act(() => {
    handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key }));
  });
  return handled;
}

/**
 * 初期マウント時に `useEffect` が `queueMicrotask` で予約した
 * `setSelectedIndex(0)` を flush するためのヘルパー。これを呼ばないと最初の
 * 矢印キー押下時に「リセット → 矢印反映」の順で state が更新されて、
 * テストの期待値と矛盾する。
 *
 * Drain the microtask that the component queues during initial mount via
 * `useEffect` (the `setSelectedIndex(0)` reset). Without this, the first
 * arrow-key press races the reset and ends up at index 0.
 */
async function settleInitialMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderTagSuggestion(props: {
  query: string;
  candidates: TagSuggestionCandidate[];
  onSelect?: (item: { name: string; exists: boolean; targetId: string | null }) => void;
  onClose?: () => void;
}) {
  const ref: RefObject<TagSuggestionHandle | null> = createRef();
  const onSelect = props.onSelect ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <TagSuggestion
      ref={ref}
      query={props.query}
      range={{ from: 0, to: props.query.length + 1 }}
      onSelect={onSelect}
      onClose={onClose}
      candidates={props.candidates}
    />,
  );
  return { ...utils, ref, onSelect, onClose };
}

describe("TagSuggestion — items list", () => {
  // 6 件以上の候補が部分一致するシナリオを再現するための雛形。`tec` を含む
  // 候補を 7 件並べ、6 番目 (`tec`) がちょうど完全一致になる構成。
  // Builds a candidate list of 7 entries that all match `tec`, with the 6th
  // entry being the exact match — designed to reproduce the original bug.
  function makeOverflowingCandidates(): TagSuggestionCandidate[] {
    return [
      { name: "techDeep", exists: true, targetId: "p1" },
      { name: "technique", exists: true, targetId: "p2" },
      { name: "techEarly", exists: true, targetId: "p3" },
      { name: "technician", exists: true, targetId: "p4" },
      { name: "techlead", exists: true, targetId: "p5" },
      { name: "tec", exists: true, targetId: "p6" }, // exact match
      { name: "tecArchive", exists: true, targetId: "p7" },
    ];
  }

  it("keeps the exact match visible even when it sits beyond MAX_VISIBLE substring matches (issue #767 review)", () => {
    // バグ前: `tec` 完全一致が 6 番目だったため `slice(0, 5)` で消え、なおかつ
    // `exactMatch` が truthy だったため「新規作成」項目も追加されず選択不能。
    // Pre-fix: with `tec` at position 6, the slice dropped it from the visible
    // list and the "create" fallback was suppressed (exactMatch was truthy).
    renderTagSuggestion({ query: "tec", candidates: makeOverflowingCandidates() });

    const buttons = screen.getAllByRole("button");
    // 完全一致 `#tec` が表示されている。
    // The exact-match `#tec` row is rendered.
    const tecButton = buttons.find((b) => b.textContent === "#tec");
    expect(tecButton).toBeDefined();
  });

  it("places the exact match at the top of the visible list", () => {
    // 並べ替えの安定性を固定: 完全一致が先頭に来る（残り順序は元のまま）。
    // Pin sort stability — exact match leads, the rest keep insertion order.
    renderTagSuggestion({ query: "tec", candidates: makeOverflowingCandidates() });
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]?.textContent).toBe("#tec");
  });

  it("shows the create-new fallback only when no exact match exists", () => {
    // 完全一致が無いクエリでは「新規作成」項目を出す。完全一致があるクエリでは
    // 既存の挙動どおり出さない。
    // Without an exact match the create option appears; with one, it does not.
    const candidates: TagSuggestionCandidate[] = [
      { name: "techDeep", exists: true, targetId: "p1" },
    ];
    renderTagSuggestion({ query: "tec", candidates });

    expect(screen.getByText('"#tec" を作成')).toBeInTheDocument();
    cleanup();

    const withExact: TagSuggestionCandidate[] = [
      ...candidates,
      { name: "tec", exists: true, targetId: "p2" },
    ];
    renderTagSuggestion({ query: "tec", candidates: withExact });
    expect(screen.queryByText('"#tec" を作成')).toBeNull();
  });

  it("returns null (renders nothing) when the candidate list is empty and the query is empty", () => {
    const { container } = renderTagSuggestion({ query: "", candidates: [] });
    expect(container.firstChild).toBeNull();
  });

  it("invokes onSelect with the chosen item when a row is clicked", () => {
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [
      { name: "tech", exists: true, targetId: "p-uuid-1" },
      { name: "design", exists: true, targetId: "p-uuid-2" },
    ];
    renderTagSuggestion({ query: "des", candidates, onSelect });

    const button = screen.getByRole("button", { name: /#design/ });
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledWith({
      name: "design",
      exists: true,
      targetId: "p-uuid-2",
    });
  });
});

describe("TagSuggestion — keyboard navigation via imperative handle", () => {
  it("Enter confirms the highlighted item", () => {
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [
      { name: "tech", exists: true, targetId: "p1" },
      { name: "tea", exists: true, targetId: "p2" },
    ];
    const { ref } = renderTagSuggestion({ query: "te", candidates, onSelect });

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter" });
    expect(ref.current?.onKeyDown(enterEvent)).toBe(true);
    expect(onSelect).toHaveBeenCalledWith({
      name: "tech",
      exists: true,
      targetId: "p1",
    });
  });

  it("Tab confirms the highlighted item (acceptance criteria)", () => {
    // 受け入れ条件で Tab も Enter と同じく確定操作として扱う。
    // Acceptance criteria: Tab confirms just like Enter.
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [{ name: "tech", exists: true, targetId: "p1" }];
    const { ref } = renderTagSuggestion({ query: "tec", candidates, onSelect });

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab" });
    expect(ref.current?.onKeyDown(tabEvent)).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    const candidates: TagSuggestionCandidate[] = [{ name: "tech", exists: true, targetId: "p1" }];
    const { ref } = renderTagSuggestion({ query: "tec", candidates, onClose });

    const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
    expect(ref.current?.onKeyDown(escEvent)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape still closes when the items list is empty (no matches yet)", () => {
    // 候補ゼロでも Esc で閉じる経路を保証する（プラグインの close メタ送出への
    // 入口）。それ以外のキーは素通し（タイピング継続を妨げない）。
    // Esc must still close even when there are no items so the host can
    // dispatch the close meta on the plugin. Other keys fall through to keep
    // typing alive.
    const onClose = vi.fn();
    const { ref } = renderTagSuggestion({ query: "", candidates: [], onClose });

    const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
    expect(ref.current?.onKeyDown(escEvent)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    const otherEvent = new KeyboardEvent("keydown", { key: "Enter" });
    expect(ref.current?.onKeyDown(otherEvent)).toBe(false);
  });

  // 矢印キー / ラップアラウンド契約を固定する（受け入れ条件 + PR #778 レビュー反映）。
  // Pin the arrow-key + wrap-around contract listed in the issue acceptance
  // criteria (review feedback on PR #778 from coderabbitai).
  it("ArrowUp from the first item wraps to the last and Enter confirms it", async () => {
    // クエリ `tea` が `tea` と完全一致 + `team` の部分一致になり、`tech` には
    // マッチしないため items は [tea (exact, 並び替え先頭), team] の 2 件、
    // 「新規作成」項目は混ざらない。ArrowUp が末尾の `team` にラップする挙動を
    // 純粋に検証できる。
    // `tea` exactly matches one candidate and substring-matches `team`, so
    // items is exactly [tea, team] without any "create new" suffix —
    // letting us test ArrowUp wrap to the last real candidate cleanly.
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [
      { name: "tea", exists: true, targetId: "p2" },
      { name: "team", exists: true, targetId: "p3" },
      { name: "tech", exists: true, targetId: "p1" }, // does NOT match "tea"
    ];
    const { ref } = renderTagSuggestion({ query: "tea", candidates, onSelect });
    await settleInitialMicrotasks();

    expect(pressKey(ref, "ArrowUp")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({
      name: "team",
      exists: true,
      targetId: "p3",
    });
  });

  it("ArrowDown from the last item wraps back to the first and Enter confirms it", async () => {
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [
      { name: "tea", exists: true, targetId: "p2" },
      { name: "team", exists: true, targetId: "p3" },
    ];
    // query が完全一致するため "create new" は混ざらず items.length = 2。
    // Exact match → no "create new" suffix, items.length is exactly 2.
    const { ref } = renderTagSuggestion({ query: "tea", candidates, onSelect });
    await settleInitialMicrotasks();

    // 0 → 1 → 0（末尾を通り越して先頭へ巻き戻る）。
    // 0 → 1 → 0 (wrap from last back to first).
    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({
      name: "tea",
      exists: true,
      targetId: "p2",
    });
  });

  it("ArrowDown advances the highlight one step at a time", async () => {
    // 単発の ArrowDown でも次の候補にハイライトが進むことを Enter 経由で確認。
    // A single ArrowDown advances by one — verified via Enter confirming the
    // next candidate.
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [
      { name: "tech", exists: true, targetId: "p1" },
      { name: "tea", exists: true, targetId: "p2" },
      { name: "team", exists: true, targetId: "p3" },
    ];
    const { ref } = renderTagSuggestion({ query: "te", candidates, onSelect });
    await settleInitialMicrotasks();

    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith({
      name: "tea",
      exists: true,
      targetId: "p2",
    });
  });

  it("Arrow keys are no-ops with a single candidate (no out-of-range index)", async () => {
    // 候補が 1 件のとき、矢印キーで配列範囲外に飛ばないことを保証する。
    // クエリは `tech` 完全一致にして「新規作成」項目が混ざらないようにする。
    // With a single matching item (and an exact-match query so no "create
    // new" suffix is added) the ref must not push the highlight out of range.
    const onSelect = vi.fn();
    const candidates: TagSuggestionCandidate[] = [{ name: "tech", exists: true, targetId: "p1" }];
    const { ref } = renderTagSuggestion({ query: "tech", candidates, onSelect });
    await settleInitialMicrotasks();

    expect(pressKey(ref, "ArrowUp")).toBe(true);
    expect(pressKey(ref, "ArrowDown")).toBe(true);
    expect(pressKey(ref, "Enter")).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith({
      name: "tech",
      exists: true,
      targetId: "p1",
    });
  });
});
