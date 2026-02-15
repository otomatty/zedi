import { format, isToday, isYesterday, startOfDay, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Page, DateGroup } from '@/types/page';

/** yyyy-MM 形式の文字列をローカルタイムで月初・月末のミリ秒に変換 */
export function getMonthRange(yyyyMM: string): { start: number; end: number } {
  const [y, m] = yyyyMM.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    return { start: 0, end: 0 };
  }
  const date = new Date(y, m - 1, 1);
  const start = startOfMonth(date).getTime();
  const end = endOfMonth(date).getTime();
  return { start, end };
}

/** タイムスタンプが指定月（yyyy-MM）に含まれるか（ローカルタイム） */
export function isTimestampInMonth(ts: number, yyyyMM: string): boolean {
  const { start, end } = getMonthRange(yyyyMM);
  if (start === 0) return false;
  return ts >= start && ts <= end;
}

/** ページの updatedAt から重複を除いた yyyy-MM の配列（新しい順） */
export function getAvailableMonthsFromPages(pages: { updatedAt: number }[]): string[] {
  const set = new Set<string>();
  pages.forEach((p) => {
    const d = new Date(p.updatedAt);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export function formatDateLabel(date: Date): string {
  if (isToday(date)) {
    return `今日（${format(date, 'M月d日・E', { locale: ja })}）`;
  }
  if (isYesterday(date)) {
    return `昨日（${format(date, 'M月d日・E', { locale: ja })}）`;
  }
  return format(date, 'M月d日（E）', { locale: ja });
}

export function getDateKey(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd');
}

export function groupPagesByDate(pages: Page[]): DateGroup[] {
  const groups: Map<string, Page[]> = new Map();
  
  // Sort pages by updatedAt descending
  const sortedPages = [...pages]
    .filter(p => !p.isDeleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  
  sortedPages.forEach((page) => {
    const dateKey = getDateKey(page.updatedAt);
    const existing = groups.get(dateKey) || [];
    groups.set(dateKey, [...existing, page]);
  });
  
  // Convert to array and sort by date descending
  const result: DateGroup[] = [];
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  
  sortedKeys.forEach((dateKey) => {
    const date = parseISO(dateKey);
    result.push({
      date: dateKey,
      label: formatDateLabel(date),
      pages: groups.get(dateKey)!,
    });
  });
  
  return result;
}

export function formatMonthYear(date: Date): string {
  return format(date, 'yyyy年M月', { locale: ja });
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'たった今';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}日前`;
  
  return format(new Date(timestamp), 'M/d', { locale: ja });
}
