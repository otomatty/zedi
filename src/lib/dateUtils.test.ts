import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatDateLabel, getDateKey, groupPagesByDate, formatTimeAgo } from "./dateUtils";
import type { Page } from "@/types/page";

/**
 * Build a Page fixture succinctly.
 * ページの最小限のテストフィクスチャを生成する。
 */
function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: overrides.id ?? "p1",
    ownerUserId: "u1",
    title: overrides.title ?? "Test",
    content: "{}",
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    isDeleted: overrides.isDeleted ?? false,
    ...overrides,
  };
}

describe("formatDateLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2024-06-15 (Saturday, 土曜日) を "今日" として固定。
    // Freeze "today" as 2024-06-15 (Saturday / 土).
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the exact "今日（M月d日・E）" label for today', () => {
    // ラベル文字列・日付・曜日の全てを厳密一致で検証する。
    // Assert the exact literal so mutations on any character survive none of them.
    const today = new Date(2024, 5, 15);
    expect(formatDateLabel(today)).toBe("今日（6月15日・土）");
  });

  it('returns the exact "昨日（M月d日・E）" label for yesterday', () => {
    const yesterday = new Date(2024, 5, 14);
    expect(formatDateLabel(yesterday)).toBe("昨日（6月14日・金）");
  });

  it('returns the "M月d日（E）" form for any other date (non-today / non-yesterday branch)', () => {
    // 今日・昨日以外の分岐をカバーする（この経路が無いとフォーマット文字列変異が検知できない）。
    // Covers the fall-through branch; without it the `"M月d日（E）"` literal can mutate undetected.
    const twoDaysAgo = new Date(2024, 5, 13);
    expect(formatDateLabel(twoDaysAgo)).toBe("6月13日（木）");
  });

  it("uses the ・ separator for today/yesterday (not the （ separator)", () => {
    // "・" → "（" のような区切り変異が生き残らないよう、区切り文字自体を検証する。
    // Explicitly pin the separator so swaps between "・" and "（" are caught.
    const today = new Date(2024, 5, 15);
    expect(formatDateLabel(today)).toContain("・");
  });
});

describe("getDateKey", () => {
  it("returns the exact yyyy-MM-dd string for a given timestamp", () => {
    const ts = new Date(2024, 2, 5).getTime();
    expect(getDateKey(ts)).toBe("2024-03-05");
  });

  it("zero-pads single-digit months and days", () => {
    // 月・日のゼロ埋めを検証する（"M-d" 形式への変異を検知）。
    // Pin zero-padding so the "yyyy-MM-dd" format can't silently drift to "yyyy-M-d".
    const ts = new Date(2024, 0, 9).getTime();
    expect(getDateKey(ts)).toBe("2024-01-09");
  });

  it("uses local-time day boundaries (not UTC) for timestamps near midnight", () => {
    // ローカル時刻基準であることを検証する（UTC 化への変異は日付が前日にズレる）。
    // Asserts the local-time semantics implicit in `new Date(timestamp)` formatting.
    const ts = new Date(2024, 5, 15, 23, 30, 0).getTime();
    expect(getDateKey(ts)).toBe("2024-06-15");
  });
});

describe("groupPagesByDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty array for empty input", () => {
    // 入力が空のときの戻り値形状を明示的に検証する。
    // Documents the empty-input shape; a mutation that, say, returns `[{}]` would be caught.
    expect(groupPagesByDate([])).toEqual([]);
  });

  it("returns an empty array when every page is soft-deleted", () => {
    // `!p.isDeleted` のフィルタが外される変異を検知する。
    // Kills the `!p.isDeleted` filter mutation (remove-negation) by asserting empty output.
    const pages: Page[] = [
      makePage({ id: "a", updatedAt: new Date(2024, 5, 15, 10).getTime(), isDeleted: true }),
      makePage({ id: "b", updatedAt: new Date(2024, 5, 14, 9).getTime(), isDeleted: true }),
    ];
    expect(groupPagesByDate(pages)).toEqual([]);
  });

  it("groups pages by date, filters deleted, and produces human-readable labels", () => {
    const pages: Page[] = [
      makePage({ id: "a", updatedAt: new Date(2024, 5, 15, 10).getTime() }),
      makePage({ id: "b", updatedAt: new Date(2024, 5, 15, 8).getTime() }),
      makePage({ id: "c", updatedAt: new Date(2024, 5, 14, 9).getTime() }),
      makePage({ id: "d", updatedAt: new Date(2024, 5, 14, 7).getTime(), isDeleted: true }),
    ];
    const groups = groupPagesByDate(pages);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2024-06-15");
    expect(groups[0].label).toBe("今日（6月15日・土）");
    expect(groups[0].pages).toHaveLength(2);
    expect(groups[1].date).toBe("2024-06-14");
    expect(groups[1].label).toBe("昨日（6月14日・金）");
    expect(groups[1].pages).toHaveLength(1);
    expect(groups[1].pages[0].id).toBe("c");
  });

  it("orders pages within a group by updatedAt descending", () => {
    // グループ内のソート方向（降順）を明示検証する。
    // `b.updatedAt - a.updatedAt` → `a.updatedAt - b.updatedAt` への変異を殺す。
    const pages: Page[] = [
      makePage({ id: "old", updatedAt: new Date(2024, 5, 15, 8).getTime() }),
      makePage({ id: "new", updatedAt: new Date(2024, 5, 15, 10).getTime() }),
      makePage({ id: "mid", updatedAt: new Date(2024, 5, 15, 9).getTime() }),
    ];
    const [group] = groupPagesByDate(pages);
    expect(group.pages.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("orders groups by date descending (newest first)", () => {
    // グループ間のソート方向（降順）を検証する。
    // Kills `b.localeCompare(a)` → `a.localeCompare(b)` mutation.
    const pages: Page[] = [
      makePage({ id: "older", updatedAt: new Date(2024, 5, 13, 12).getTime() }),
      makePage({ id: "newer", updatedAt: new Date(2024, 5, 15, 12).getTime() }),
      makePage({ id: "middle", updatedAt: new Date(2024, 5, 14, 12).getTime() }),
    ];
    const dates = groupPagesByDate(pages).map((g) => g.date);
    expect(dates).toEqual(["2024-06-15", "2024-06-14", "2024-06-13"]);
  });

  it("does not mutate the input array (defensive copy before sort)", () => {
    // `[...pages].sort` のスプレッドが `pages.sort` に変異すると元配列が破壊される。
    // Kills the "remove defensive copy" mutation by asserting original ordering is preserved.
    const a = makePage({ id: "a", updatedAt: new Date(2024, 5, 15, 8).getTime() });
    const b = makePage({ id: "b", updatedAt: new Date(2024, 5, 15, 12).getTime() });
    const input: Page[] = [a, b];
    groupPagesByDate(input);
    expect(input.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("formatTimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "たった今" for 0 seconds ago', () => {
    expect(formatTimeAgo(Date.now())).toBe("たった今");
  });

  it('returns "たった今" just below the 60-second boundary (59s)', () => {
    // `seconds < 60` の境界直前を検証する。
    // Covers the `<` boundary; mutation to `<=` does not change this case.
    expect(formatTimeAgo(Date.now() - 59 * 1000)).toBe("たった今");
  });

  it('returns "1分前" exactly at the 60-second boundary', () => {
    // 境界値 60 秒での挙動を検証する。
    // `seconds < 60` → `seconds <= 60` 変異では 60 秒が "たった今" に化けて落ちる。
    expect(formatTimeAgo(Date.now() - 60 * 1000)).toBe("1分前");
  });

  it('returns "59分前" just below the 1-hour boundary (3599s)', () => {
    expect(formatTimeAgo(Date.now() - 3599 * 1000)).toBe("59分前");
  });

  it('returns "1時間前" exactly at the 1-hour boundary (3600s)', () => {
    // `seconds < 3600` の境界を殺す。
    // Kills the `<` → `<=` mutation at 3600s.
    expect(formatTimeAgo(Date.now() - 3600 * 1000)).toBe("1時間前");
  });

  it('returns "23時間前" just below the 24-hour boundary', () => {
    expect(formatTimeAgo(Date.now() - 86399 * 1000)).toBe("23時間前");
  });

  it('returns "1日前" exactly at the 24-hour boundary (86400s)', () => {
    // `seconds < 86400` の境界を殺す。
    // Kills the `<` → `<=` mutation at 86400s.
    expect(formatTimeAgo(Date.now() - 86400 * 1000)).toBe("1日前");
  });

  it('returns "6日前" just below the 7-day boundary', () => {
    expect(formatTimeAgo(Date.now() - 604799 * 1000)).toBe("6日前");
  });

  it('falls back to "M/d" at exactly the 7-day boundary (604800s)', () => {
    // 7 日以上の場合の M/d フォールバック経路をカバーする。
    // Without this, both the literal "M/d" and the final return branch go uncovered.
    expect(formatTimeAgo(Date.now() - 604800 * 1000)).toBe("6/8");
  });

  it('returns "M/d" format for timestamps older than a week', () => {
    // 具体的な日付文字列を検証し、フォーマット文字列の変異を殺す。
    // Pins the literal "M/d" output; "M月d日" → would surface under format string mutations.
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    expect(formatTimeAgo(tenDaysAgo)).toBe("6/5");
  });

  it("truncates (not rounds) the minute count via Math.floor", () => {
    // 90 秒は 1.5 分だが、Math.floor で "1分前" になる。
    // `Math.floor` → no-floor mutation would yield "1.5分前".
    expect(formatTimeAgo(Date.now() - 90 * 1000)).toBe("1分前");
  });

  it("truncates (not rounds) the hour count via Math.floor", () => {
    // 90 分は 1.5 時間だが、Math.floor で "1時間前"。
    expect(formatTimeAgo(Date.now() - 90 * 60 * 1000)).toBe("1時間前");
  });

  it("truncates (not rounds) the day count via Math.floor", () => {
    // 36 時間は 1.5 日だが、Math.floor で "1日前"。
    expect(formatTimeAgo(Date.now() - 36 * 60 * 60 * 1000)).toBe("1日前");
  });

  it('returns "5分前" for 5 minutes', () => {
    expect(formatTimeAgo(Date.now() - 5 * 60 * 1000)).toBe("5分前");
  });

  it('returns "2時間前" for 2 hours', () => {
    expect(formatTimeAgo(Date.now() - 2 * 60 * 60 * 1000)).toBe("2時間前");
  });

  it('returns "3日前" for 3 days', () => {
    expect(formatTimeAgo(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe("3日前");
  });
});
