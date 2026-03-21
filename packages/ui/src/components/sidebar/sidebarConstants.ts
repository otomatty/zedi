/** Cookie name for persisted sidebar open/closed state. / サイドバー開閉状態の Cookie 名 */
export const SIDEBAR_COOKIE_NAME = "sidebar:state";

/** Max-Age for sidebar cookie (seconds). / サイドバー Cookie の max-age（秒） */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Read sidebar open state from document.cookie, or null if unset.
 * document.cookie からサイドバー開閉を読み取る。未設定なら null。
 */
export function readSidebarOpenFromCookie(): boolean | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
  const value = match?.split("=")[1];
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** Default sidebar width (desktop). / デスクトップ時のデフォルト幅 */
export const SIDEBAR_WIDTH = "16rem";

/** Sidebar width on mobile sheet. / モバイルシート時の幅 */
export const SIDEBAR_WIDTH_MOBILE = "18rem";

/** Collapsed “icon” rail width. / アイコン折りたたみ時の幅 */
export const SIDEBAR_WIDTH_ICON = "3rem";

/** Keyboard shortcut key (with Meta/Ctrl) to toggle sidebar. / サイドバー切替のキー（Meta/Ctrl と併用） */
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";
