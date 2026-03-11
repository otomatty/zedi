import React from "react";
import { cn } from "@zedi/ui";

export interface BubbleMenuButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  isActive: boolean;
  children: React.ReactNode;
}

/** Keep editor focus when clicking the button so BubbleMenu shouldShow(hasFocus) does not hide the menu before click fires. */
function handleMouseDown(e: React.MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
}

/** Small toolbar button for the bubble menu */
export function BubbleMenuButton({
  onClick,
  isActive,
  children,
  className,
  onMouseDown: onMouseDownProp,
  ...props
}: BubbleMenuButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        handleMouseDown(e);
        onMouseDownProp?.(e);
      }}
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
