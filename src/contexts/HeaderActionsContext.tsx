import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * 共通ヘッダーの中央スロットに、ページ固有のアクションをポータル風に
 * 注入するためのコンテキスト。`Header` 側が `setLeftSlot` / `setRightSlot`
 * に DOM 要素を登録し、ページ側は `leftSlot` / `rightSlot` 要素を
 * 受け取って `createPortal` で内容を描画する想定。
 *
 * Context that lets pages inject page-specific actions into the shared
 * `Header`'s left/right slots. The `Header` registers DOM nodes via
 * `setLeftSlot` / `setRightSlot`, and pages can portal content into
 * the exposed `leftSlot` / `rightSlot` elements.
 */
interface HeaderActionsContextValue {
  leftSlot: HTMLElement | null;
  rightSlot: HTMLElement | null;
  setLeftSlot: (el: HTMLElement | null) => void;
  setRightSlot: (el: HTMLElement | null) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null);

/**
 * ヘッダーの左右スロットを管理する Provider。`Header` / `MobileHeader`
 * が `setLeftSlot` / `setRightSlot` で DOM 要素を登録し、ページ側は
 * `useHeaderActions` 経由で取得した要素に `createPortal` でアクションを
 * 注入する想定。`AppLayout` 直下に置き、アプリ全体で 1 インスタンスを
 * 共有する。
 *
 * Provider that manages the left/right header action slots. `Header` /
 * `MobileHeader` register DOM nodes via `setLeftSlot` / `setRightSlot`,
 * and pages portal content into the exposed slot elements obtained via
 * `useHeaderActions`. Mounted once at the `AppLayout` root and shared
 * across the whole app.
 *
 * @param children - Provider 配下にレンダーする要素 / React subtree to render under the provider.
 */
export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [leftSlot, setLeftSlotState] = useState<HTMLElement | null>(null);
  const [rightSlot, setRightSlotState] = useState<HTMLElement | null>(null);

  const setLeftSlot = useCallback((el: HTMLElement | null) => setLeftSlotState(el), []);
  const setRightSlot = useCallback((el: HTMLElement | null) => setRightSlotState(el), []);

  const value: HeaderActionsContextValue = {
    leftSlot,
    rightSlot,
    setLeftSlot,
    setRightSlot,
  };

  return <HeaderActionsContext.Provider value={value}>{children}</HeaderActionsContext.Provider>;
}

/**
 * ヘッダースロットを参照するためのフック。Provider 外でも安全に呼べるよう
 * `null` を返す。consumer 側は optional chain (`?.`) で利用する。
 *
 * Hook to access the header slots. Returns `null` when used outside
 * the provider so callers can safely optional-chain into it.
 */
export function useHeaderActions(): HeaderActionsContextValue | null {
  return useContext(HeaderActionsContext);
}
