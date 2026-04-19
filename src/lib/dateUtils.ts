import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type { Page, DateGroup } from "@/types/page";

/**
 * Human-readable Japanese label for a calendar date (e.g. `今日（4月19日・日）` /
 * `4月19日（日）`). Uses "今日" / "昨日" for today and yesterday, otherwise the
 * short month-day-weekday form.
 *
 * カレンダー日を日本語の表示用ラベルに整形する。今日 / 昨日は「今日」「昨日」を
 * 前置し、それ以外は「M月d日（曜）」を返す。
 */
export function formatDateLabel(date: Date): string {
  if (isToday(date)) {
    return `今日（${format(date, "M月d日・E", { locale: ja })}）`;
  }
  if (isYesterday(date)) {
    return `昨日（${format(date, "M月d日・E", { locale: ja })}）`;
  }
  return format(date, "M月d日（E）", { locale: ja });
}

/**
 * Returns the local-time `yyyy-MM-dd` key for a timestamp. Used to group pages
 * by day.
 *
 * タイムスタンプをローカル日付の `yyyy-MM-dd` キーに変換する。ページの日別グルーピングに使用。
 */
export function getDateKey(timestamp: number): string {
  return format(new Date(timestamp), "yyyy-MM-dd");
}

/**
 * Groups pages by `updatedAt` date (descending), dropping soft-deleted ones.
 * Each group carries a human-readable label from {@link formatDateLabel}.
 *
 * ページを `updatedAt` の日付で降順グルーピングする。論理削除済みは除外し、
 * 各グループに {@link formatDateLabel} で生成した表示ラベルを付ける。
 */
export function groupPagesByDate(pages: Page[]): DateGroup[] {
  const groups: Map<string, Page[]> = new Map();

  // Sort pages by updatedAt descending.
  // ページを updatedAt で降順にソート。
  const sortedPages = [...pages]
    .filter((p) => !p.isDeleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  sortedPages.forEach((page) => {
    const dateKey = getDateKey(page.updatedAt);
    const existing = groups.get(dateKey) || [];
    groups.set(dateKey, [...existing, page]);
  });

  // Convert to array and sort by date descending.
  // 配列に変換し、日付降順で並べる。
  const result: DateGroup[] = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  sortedKeys.forEach((dateKey) => {
    const date = parseISO(dateKey);
    const pages = groups.get(dateKey);
    if (pages) {
      result.push({
        date: dateKey,
        label: formatDateLabel(date),
        pages,
      });
    }
  });

  return result;
}

/**
 * Compact relative-time label in Japanese (e.g. `たった今` / `5分前` / `2時間前` /
 * `3日前`). Falls back to an `M/d` date for anything older than a week.
 *
 * 日本語の相対時刻ラベル（「たった今」「5分前」「2時間前」「3日前」など）。
 * 1 週間を超える場合は `M/d` 形式の日付表記にフォールバックする。
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "たった今";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}日前`;

  return format(new Date(timestamp), "M/d", { locale: ja });
}
