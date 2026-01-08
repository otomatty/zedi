import { format, isToday, isYesterday, startOfDay, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Page, DateGroup } from '@/types/page';

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
