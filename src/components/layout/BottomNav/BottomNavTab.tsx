import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@zedi/ui";

interface BottomNavTabProps {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  active: boolean;
}

/**
 * One entry in the mobile bottom navigation bar. Always renders as a
 * `<Link>` inside an `<li>`; active state is communicated via
 * `aria-current="page"` for assistive tech and via accent color visually.
 *
 * モバイルボトムナビの 1 項目。常に `<Link>` として `<li>` 内に描画し、
 * アクティブ状態は `aria-current="page"` とアクセントカラーで示す。
 */
export const BottomNavTab: React.FC<BottomNavTabProps> = ({ to, icon: Icon, label, active }) => {
  return (
    <li className="flex-1">
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </Link>
    </li>
  );
};
