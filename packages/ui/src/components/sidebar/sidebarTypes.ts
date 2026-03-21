/**
 * Sidebar UI state exposed by SidebarProvider (desktop collapse, mobile sheet, etc.).
 * SidebarProvider が公開するサイドバー UI の状態（デスクトップ折りたたみ・モバイルシート等）。
 */
export type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};
