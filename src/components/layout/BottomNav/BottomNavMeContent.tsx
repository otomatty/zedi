/**
 * Thin re-export module so the `/account` page and the desktop avatar
 * dropdown share the exact same menu content. This keeps the UnifiedMenu
 * surface the single source of truth for account actions, sync status and
 * sign-in / sign-out.
 *
 * `/account` ページとデスクトップのアバタードロップダウンで同じメニュー内容を
 * 共有するための薄い再エクスポート。アカウント操作・同期ステータス・サインイン/
 * サインアウトの単一ソースを {@link UnifiedMenu} に保つ。
 */
export { SignedInMenuContent, SignedOutMenuContent } from "../Header/UnifiedMenu";
