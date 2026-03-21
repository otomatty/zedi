import * as React from "react";

import type { SidebarContextValue } from "./sidebarTypes";

/**
 * React context for sidebar state. Prefer {@link useSidebar} for consumers.
 * サイドバー状態用の React コンテキスト。利用側は {@link useSidebar} を推奨。
 */
export const SidebarContext = React.createContext<SidebarContextValue | null>(null);
