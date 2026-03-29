import React from "react";

/**
 * One entry in the user-menu primary navigation grid/list.
 * ユーザーメニューの主要ナビゲーション 1 項目。
 */
export interface NavItem {
  icon: React.FC<{ className?: string }>;
  label: string;
  path: string;
}

/** Layout variant for {@link NavItems}. / {@link NavItems} のレイアウト種別 */
export type NavLayout = "grid" | "list";

interface NavItemsProps {
  items: NavItem[];
  layout: NavLayout;
  onNavigate: (path: string) => void;
}

function navItemsContainerClass(layout: NavLayout): string {
  switch (layout) {
    case "list":
      return "flex flex-col gap-1 p-2";
    case "grid":
      return "grid grid-cols-3 gap-2 p-2";
    default: {
      const _exhaustive: never = layout;
      return _exhaustive;
    }
  }
}

/**
 * Grid or list of primary navigation buttons for the user menu.
 * ユーザーメニュー用のグリッドまたはリストのナビゲーションボタン群。
 */
export const NavItems: React.FC<NavItemsProps> = ({ items, layout, onNavigate }) => (
  <div className={navItemsContainerClass(layout)}>
    {items.map((item) => {
      const Icon = item.icon;
      switch (layout) {
        case "list":
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => onNavigate(item.path)}
              className="hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
            >
              <Icon className="text-muted-foreground h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        case "grid":
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => onNavigate(item.path)}
              className="hover:bg-muted flex flex-col items-center gap-2 rounded-lg p-3 transition-colors"
            >
              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="text-muted-foreground h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        default: {
          const _exhaustive: never = layout;
          return _exhaustive;
        }
      }
    })}
  </div>
);
