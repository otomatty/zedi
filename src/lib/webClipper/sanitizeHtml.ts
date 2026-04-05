/**
 * HTML サニタイズ（危険なタグ・属性を除去）。
 * Sanitizes HTML by removing dangerous tags and attributes.
 *
 * DOMPurify を使用し、Mutation XSS を含む幅広い攻撃ベクトルに対応する。
 * Uses DOMPurify to handle a wide range of attack vectors including Mutation XSS.
 */
import DOMPurify from "dompurify";
import { ALLOWED_ATTR, ALLOWED_TAGS } from "./sanitizeHtmlConfig";

/**
 * 危険な要素・属性を除去した HTML を返す。
 * Returns HTML with dangerous elements and attributes removed.
 *
 * @param html - サニタイズ対象の HTML 文字列 / Raw HTML string to sanitize
 * @returns サニタイズ済み HTML / Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTR],
    ALLOW_DATA_ATTR: false,
  });
}
