import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMonthRange,
  isTimestampInMonth,
  getAvailableMonthsFromPages,
  formatDateLabel,
  getDateKey,
  groupPagesByDate,
  formatMonthYear,
  formatTimeAgo,
} from "./dateUtils";
import type { Page } from "@/types/page";

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

describe("getMonthRange", () => {
  it("returns correct start/end for valid month", () => {
    const { start, end } = getMonthRange("2024-03");
    const startDate = new Date(start);
    const endDate = new Date(end);
    expect(startDate.getFullYear()).toBe(2024);
    expect(startDate.getMonth()).toBe(2);
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getFullYear()).toBe(2024);
    expect(endDate.getMonth()).toBe(2);
    expect(endDate.getDate()).toBe(31);
  });

  it("returns {0,0} for invalid month", () => {
    expect(getMonthRange("invalid")).toEqual({ start: 0, end: 0 });
    expect(getMonthRange("2024-13")).toEqual({ start: 0, end: 0 });
    expect(getMonthRange("2024-00")).toEqual({ start: 0, end: 0 });
  });
});

describe("isTimestampInMonth", () => {
  it("returns true for timestamp in month", () => {
    const ts = new Date(2024, 2, 15).getTime();
    expect(isTimestampInMonth(ts, "2024-03")).toBe(true);
  });

  it("returns false for timestamp outside month", () => {
    const ts = new Date(2024, 3, 1).getTime();
    expect(isTimestampInMonth(ts, "2024-03")).toBe(false);
  });
});

describe("getAvailableMonthsFromPages", () => {
  it("returns unique months sorted desc", () => {
    const pages = [
      { updatedAt: new Date(2024, 0, 10).getTime() },
      { updatedAt: new Date(2024, 2, 5).getTime() },
      { updatedAt: new Date(2024, 0, 20).getTime() },
      { updatedAt: new Date(2023, 11, 1).getTime() },
    ];
    const months = getAvailableMonthsFromPages(pages);
    expect(months).toEqual(["2024-03", "2024-01", "2023-12"]);
  });
});

describe("formatDateLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "今日（...）" for today', () => {
    const today = new Date(2024, 5, 15);
    const label = formatDateLabel(today);
    expect(label).toMatch(/^今日（/);
    expect(label).toMatch(/）$/);
  });

  it('returns "昨日（...）" for yesterday', () => {
    const yesterday = new Date(2024, 5, 14);
    const label = formatDateLabel(yesterday);
    expect(label).toMatch(/^昨日（/);
    expect(label).toMatch(/）$/);
  });
});

describe("getDateKey", () => {
  it("returns yyyy-MM-dd format", () => {
    const ts = new Date(2024, 2, 5).getTime();
    expect(getDateKey(ts)).toBe("2024-03-05");
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

  it("groups pages by date descending and filters deleted", () => {
    const pages: Page[] = [
      makePage({ id: "a", updatedAt: new Date(2024, 5, 15, 10).getTime() }),
      makePage({ id: "b", updatedAt: new Date(2024, 5, 15, 8).getTime() }),
      makePage({ id: "c", updatedAt: new Date(2024, 5, 14, 9).getTime() }),
      makePage({ id: "d", updatedAt: new Date(2024, 5, 14, 7).getTime(), isDeleted: true }),
    ];
    const groups = groupPagesByDate(pages);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe("2024-06-15");
    expect(groups[0].pages).toHaveLength(2);
    expect(groups[1].date).toBe("2024-06-14");
    expect(groups[1].pages).toHaveLength(1);
  });
});

describe("formatMonthYear", () => {
  it("returns yyyy年M月 format", () => {
    const date = new Date(2024, 2, 1);
    expect(formatMonthYear(date)).toBe("2024年3月");
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

  it('returns "たった今" for < 60s', () => {
    const ts = Date.now() - 30 * 1000;
    expect(formatTimeAgo(ts)).toBe("たった今");
  });

  it('returns "5分前" for 5 minutes', () => {
    const ts = Date.now() - 5 * 60 * 1000;
    expect(formatTimeAgo(ts)).toBe("5分前");
  });

  it('returns "2時間前" for 2 hours', () => {
    const ts = Date.now() - 2 * 60 * 60 * 1000;
    expect(formatTimeAgo(ts)).toBe("2時間前");
  });

  it('returns "3日前" for 3 days', () => {
    const ts = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(formatTimeAgo(ts)).toBe("3日前");
  });
});
