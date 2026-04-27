import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import type { Page, DateGroup } from "@/types/page";

/**
 * Returns the active date-fns locale matching the current i18n language.
 * 現在の i18n 言語に対応する date-fns ロケールを返す。
 */
function getActiveLocale() {
  return i18n.language?.startsWith("en") ? enUS : ja;
}

const isEnglish = (): boolean => i18n.language?.startsWith("en") ?? false;

/**
 * Human-readable Japanese / English label for a calendar date.
 * Today / Yesterday are prefixed; otherwise a short month-day-weekday form.
 *
 * カレンダー日を表示用ラベルに整形する。今日 / 昨日は前置し、
 * それ以外は「M月d日（曜）」相当を返す。
 */
export function formatDateLabel(date: Date): string {
  const locale = getActiveLocale();
  // 今日 / 昨日 のラベル内では `M月d日・E` を使い、`今日（...）` のカッコと衝突させない。
  // Inner pattern for today/yesterday avoids nested `（）` by using `・` as the separator (ja).
  if (isToday(date)) {
    const inner = isEnglish()
      ? format(date, "MMM d (EEE)", { locale })
      : format(date, "M月d日・E", { locale });
    return i18n.t("common.date.today", { date: inner });
  }
  if (isYesterday(date)) {
    const inner = isEnglish()
      ? format(date, "MMM d (EEE)", { locale })
      : format(date, "M月d日・E", { locale });
    return i18n.t("common.date.yesterday", { date: inner });
  }
  return isEnglish()
    ? format(date, "MMM d (EEE)", { locale })
    : format(date, "M月d日（E）", { locale });
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
 * Compact relative-time label (e.g. "Just now" / "5 min ago" / "2 hr ago" /
 * "3 day ago"). Falls back to an `M/d` date for anything older than a week.
 *
 * 相対時刻ラベル（「たった今」「5分前」「2時間前」「3日前」など）。
 * 1 週間を超える場合は `M/d` 形式の日付表記にフォールバックする。
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return i18n.t("common.date.justNow");
  if (seconds < 3600) return i18n.t("common.date.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return i18n.t("common.date.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 604800)
    return i18n.t("common.date.daysAgo", { count: Math.floor(seconds / 86400) });

  return format(new Date(timestamp), "M/d", { locale: getActiveLocale() });
}
