import * as React from "react";

import { SidebarContext } from "./sidebarContext";
import type { SidebarContextValue } from "./sidebarTypes";

/**
 * Access sidebar state from SidebarProvider.
 * Must be used under {@link SidebarContext} / SidebarProvider.
 *
 * SidebarProvider 配下でのみ利用可能なサイドバー状態フック。
 */
export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}
