import React from "react";
import { cn } from "@zedi/ui";

export interface BubbleMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}

/** Small toolbar button for the bubble menu */
export function BubbleMenuButton({
  onClick,
  isActive,
  children,
  className,
  ...props
}: BubbleMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
