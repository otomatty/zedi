import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with `clsx`, resolving Tailwind conflicts via `tailwind-merge`.
 * `clsx` でクラス名を結合し、`tailwind-merge` で Tailwind クラスの競合を解決する。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
