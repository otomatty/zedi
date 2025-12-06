import { Button as KobalteButton } from "@kobalte/core/button";
import { type JSX, splitProps } from "solid-js";

export interface ButtonProps {
  /** Button visual variant - HeroUI style */
  variant?: "solid" | "bordered" | "flat" | "light" | "ghost" | "shadow";
  /** Button color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Button corner radius */
  radius?: "none" | "sm" | "md" | "lg" | "full";
  /** Whether button is icon-only */
  isIconOnly?: boolean;
  /** Button content */
  children: JSX.Element;
  class?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

export function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "color",
    "size",
    "radius",
    "isIconOnly",
    "children",
    "class",
  ]);

  const variant = () => local.variant || "solid";
  const color = () => local.color || "primary";
  const size = () => local.size || "md";
  const radius = () => local.radius || "md";

  const baseClasses = `
    relative inline-flex items-center justify-center gap-2 
    font-medium select-none
    transition-all duration-200 ease-out
    cursor-pointer 
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    active:scale-[0.97]
    overflow-hidden
  `;

  // Color definitions for each variant
  const colorMap = {
    primary: {
      solid: "bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-primary-500 shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40",
      bordered: "border-2 border-primary-500 text-primary-500 hover:bg-primary-500/10 focus-visible:ring-primary-500",
      flat: "bg-primary-500/20 text-primary-600 dark:text-primary-400 hover:bg-primary-500/30 focus-visible:ring-primary-500",
      light: "text-primary-500 hover:bg-primary-500/10 focus-visible:ring-primary-500",
      ghost: "text-primary-500 hover:bg-primary-500/20 focus-visible:ring-primary-500",
      shadow: "bg-primary-500 text-white shadow-lg shadow-primary-500/50 hover:shadow-xl hover:shadow-primary-500/60 hover:bg-primary-600 focus-visible:ring-primary-500",
    },
    secondary: {
      solid: "bg-neutral-600 text-white hover:bg-neutral-700 dark:bg-neutral-500 dark:hover:bg-neutral-400 focus-visible:ring-neutral-500 shadow-lg shadow-neutral-500/20",
      bordered: "border-2 border-neutral-400 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-500/10 focus-visible:ring-neutral-500",
      flat: "bg-neutral-500/20 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-500/30 focus-visible:ring-neutral-500",
      light: "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-500/10 focus-visible:ring-neutral-500",
      ghost: "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-500/20 focus-visible:ring-neutral-500",
      shadow: "bg-neutral-600 text-white shadow-lg shadow-neutral-500/40 hover:shadow-xl hover:shadow-neutral-500/50 dark:bg-neutral-500 focus-visible:ring-neutral-500",
    },
    success: {
      solid: "bg-green-500 text-white hover:bg-green-600 focus-visible:ring-green-500 shadow-lg shadow-green-500/30",
      bordered: "border-2 border-green-500 text-green-600 dark:text-green-400 hover:bg-green-500/10 focus-visible:ring-green-500",
      flat: "bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 focus-visible:ring-green-500",
      light: "text-green-600 dark:text-green-400 hover:bg-green-500/10 focus-visible:ring-green-500",
      ghost: "text-green-600 dark:text-green-400 hover:bg-green-500/20 focus-visible:ring-green-500",
      shadow: "bg-green-500 text-white shadow-lg shadow-green-500/50 hover:shadow-xl hover:shadow-green-500/60 hover:bg-green-600 focus-visible:ring-green-500",
    },
    warning: {
      solid: "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500 shadow-lg shadow-amber-500/30",
      bordered: "border-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 focus-visible:ring-amber-500",
      flat: "bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 focus-visible:ring-amber-500",
      light: "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 focus-visible:ring-amber-500",
      ghost: "text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 focus-visible:ring-amber-500",
      shadow: "bg-amber-500 text-white shadow-lg shadow-amber-500/50 hover:shadow-xl hover:shadow-amber-500/60 hover:bg-amber-600 focus-visible:ring-amber-500",
    },
    danger: {
      solid: "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 shadow-lg shadow-red-500/30",
      bordered: "border-2 border-red-500 text-red-500 hover:bg-red-500/10 focus-visible:ring-red-500",
      flat: "bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30 focus-visible:ring-red-500",
      light: "text-red-500 hover:bg-red-500/10 focus-visible:ring-red-500",
      ghost: "text-red-500 hover:bg-red-500/20 focus-visible:ring-red-500",
      shadow: "bg-red-500 text-white shadow-lg shadow-red-500/50 hover:shadow-xl hover:shadow-red-500/60 hover:bg-red-600 focus-visible:ring-red-500",
    },
    default: {
      solid: "bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-visible:ring-neutral-400",
      bordered: "border-2 border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-neutral-400",
      flat: "bg-neutral-200/50 text-neutral-700 dark:bg-neutral-700/50 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus-visible:ring-neutral-400",
      light: "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:ring-neutral-400",
      ghost: "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 focus-visible:ring-neutral-400",
      shadow: "bg-neutral-200 text-neutral-800 shadow-lg shadow-neutral-500/20 hover:shadow-xl dark:bg-neutral-700 dark:text-neutral-100 focus-visible:ring-neutral-400",
    },
  };

  const variantClasses = () => {
    return colorMap[color()]?.[variant()] || colorMap.primary.solid;
  };

  const sizeClasses = () => {
    if (local.isIconOnly) {
      switch (size()) {
        case "sm": return "w-8 h-8 min-w-8 text-sm";
        case "md": return "w-10 h-10 min-w-10 text-base";
        case "lg": return "w-12 h-12 min-w-12 text-lg";
        default: return "w-10 h-10 min-w-10 text-base";
      }
    }
    switch (size()) {
      case "sm": return "px-3 py-1.5 text-sm min-h-8";
      case "md": return "px-4 py-2 text-base min-h-10";
      case "lg": return "px-6 py-3 text-lg min-h-12";
      default: return "px-4 py-2 text-base min-h-10";
    }
  };

  const radiusClasses = () => {
    switch (radius()) {
      case "none": return "rounded-none";
      case "sm": return "rounded";
      case "md": return "rounded-lg";
      case "lg": return "rounded-xl";
      case "full": return "rounded-full";
      default: return "rounded-lg";
    }
  };

  return (
    <KobalteButton
      class={`${baseClasses} ${variantClasses()} ${sizeClasses()} ${radiusClasses()} ${local.class || ""}`}
      {...others}
    >
      {local.children}
    </KobalteButton>
  );
}
