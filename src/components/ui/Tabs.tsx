import { Tabs as KobalteTabs } from "@kobalte/core/tabs";
import { type JSX, splitProps, createMemo } from "solid-js";

export interface TabsProps {
  /** Tabs variant style - HeroUI style */
  variant?: "solid" | "underlined" | "bordered" | "light";
  /** Tabs size */
  size?: "sm" | "md" | "lg";
  /** Tabs color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  /** Tab border radius */
  radius?: "none" | "sm" | "md" | "lg" | "full";
  /** Whether tabs should take full width */
  fullWidth?: boolean;
  /** Whether all tabs are disabled */
  isDisabled?: boolean;
  /** Whether to disable animation */
  disableAnimation?: boolean;
  /** Whether to disable cursor animation */
  disableCursorAnimation?: boolean;
  /** Selected tab value */
  value?: string;
  /** Default selected tab value */
  defaultValue?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Tab orientation */
  orientation?: "horizontal" | "vertical";
  /** Additional class name */
  class?: string;
  /** Children (TabList and TabPanels) */
  children: JSX.Element;
}

export function Tabs(props: TabsProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "color",
    "radius",
    "fullWidth",
    "isDisabled",
    "disableAnimation",
    "disableCursorAnimation",
    "value",
    "defaultValue",
    "onValueChange",
    "orientation",
    "class",
    "children",
  ]);

  return (
    <KobalteTabs
      class={`${local.class || ""}`}
      value={local.value}
      defaultValue={local.defaultValue}
      onChange={local.onValueChange}
      orientation={local.orientation || "horizontal"}
      disabled={local.isDisabled}
      {...others}
    >
      {local.children}
    </KobalteTabs>
  );
}

export interface TabListProps {
  /** Tabs variant style - HeroUI style */
  variant?: "solid" | "underlined" | "bordered" | "light";
  /** Tabs size */
  size?: "sm" | "md" | "lg";
  /** Tabs color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  /** Tab border radius */
  radius?: "none" | "sm" | "md" | "lg" | "full";
  /** Whether tabs should take full width */
  fullWidth?: boolean;
  /** Whether to disable animation */
  disableAnimation?: boolean;
  /** Additional class name */
  class?: string;
  /** Children (Tab components) */
  children: JSX.Element;
}

export function TabList(props: TabListProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "color",
    "radius",
    "fullWidth",
    "disableAnimation",
    "class",
    "children",
  ]);

  const variant = () => local.variant || "solid";
  const size = () => local.size || "md";
  const radius = () => local.radius || "lg";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm": return "text-sm gap-0";
      case "md": return "text-base gap-0";
      case "lg": return "text-lg gap-0";
      default: return "text-base gap-0";
    }
  });

  const radiusClasses = createMemo(() => {
    switch (radius()) {
      case "none": return "rounded-none";
      case "sm": return "rounded-md";
      case "md": return "rounded-lg";
      case "lg": return "rounded-xl";
      case "full": return "rounded-full";
      default: return "rounded-xl";
    }
  });

  const variantClasses = createMemo(() => {
    switch (variant()) {
      case "solid":
        return `bg-neutral-100 dark:bg-neutral-800/80 p-1 ${radiusClasses()}`;
      case "underlined":
        return "border-b border-neutral-200 dark:border-neutral-700 gap-1";
      case "bordered":
        return `border-2 border-neutral-200 dark:border-neutral-700 p-1 ${radiusClasses()}`;
      case "light":
        return "gap-1";
      default:
        return "";
    }
  });

  return (
    <KobalteTabs.List
      class={`
        relative flex items-center
        ${variantClasses()}
        ${sizeClasses()}
        ${local.fullWidth ? "w-full" : "w-fit"}
        ${local.class || ""}
      `}
      {...others}
    >
      {local.children}
    </KobalteTabs.List>
  );
}

export interface TabProps {
  /** Tab value (unique identifier) */
  value: string;
  /** Tabs variant style (inherited from TabList if not set) - HeroUI style */
  variant?: "solid" | "underlined" | "bordered" | "light";
  /** Tabs size */
  size?: "sm" | "md" | "lg";
  /** Tabs color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  /** Tab border radius */
  radius?: "none" | "sm" | "md" | "lg" | "full";
  /** Whether the tab is disabled */
  isDisabled?: boolean;
  /** Whether to disable animation */
  disableAnimation?: boolean;
  /** Additional class name */
  class?: string;
  /** Tab label */
  children: JSX.Element;
}

export function Tab(props: TabProps) {
  const [local, others] = splitProps(props, [
    "value",
    "variant",
    "size",
    "color",
    "radius",
    "isDisabled",
    "disableAnimation",
    "class",
    "children",
  ]);

  const variant = () => local.variant || "solid";
  const size = () => local.size || "md";
  const color = () => local.color || "primary";
  const radius = () => local.radius || "lg";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm": return "px-3 py-1.5 text-sm";
      case "md": return "px-4 py-2 text-base";
      case "lg": return "px-5 py-2.5 text-lg";
      default: return "px-4 py-2 text-base";
    }
  });

  const radiusClasses = createMemo(() => {
    switch (radius()) {
      case "none": return "rounded-none";
      case "sm": return "rounded";
      case "md": return "rounded-lg";
      case "lg": return "rounded-xl";
      case "full": return "rounded-full";
      default: return "rounded-lg";
    }
  });

  // Color map for different variants
  const colorStyles = createMemo(() => {
    const c = color();
    const colorMap = {
      primary: {
        selected: "text-primary-500 dark:text-primary-400",
        selectedBg: "bg-primary-500",
        selectedBgLight: "bg-primary-100 dark:bg-primary-500/20",
        hover: "hover:text-primary-500",
        border: "border-primary-500",
      },
      secondary: {
        selected: "text-neutral-900 dark:text-neutral-100",
        selectedBg: "bg-neutral-700 dark:bg-neutral-300",
        selectedBgLight: "bg-neutral-200 dark:bg-neutral-700",
        hover: "hover:text-neutral-900 dark:hover:text-neutral-100",
        border: "border-neutral-500",
      },
      success: {
        selected: "text-green-500 dark:text-green-400",
        selectedBg: "bg-green-500",
        selectedBgLight: "bg-green-100 dark:bg-green-500/20",
        hover: "hover:text-green-500",
        border: "border-green-500",
      },
      warning: {
        selected: "text-amber-500 dark:text-amber-400",
        selectedBg: "bg-amber-500",
        selectedBgLight: "bg-amber-100 dark:bg-amber-500/20",
        hover: "hover:text-amber-500",
        border: "border-amber-500",
      },
      danger: {
        selected: "text-red-500 dark:text-red-400",
        selectedBg: "bg-red-500",
        selectedBgLight: "bg-red-100 dark:bg-red-500/20",
        hover: "hover:text-red-500",
        border: "border-red-500",
      },
      default: {
        selected: "text-neutral-900 dark:text-neutral-100",
        selectedBg: "bg-white dark:bg-neutral-700",
        selectedBgLight: "bg-neutral-100 dark:bg-neutral-800",
        hover: "hover:text-neutral-900 dark:hover:text-neutral-100",
        border: "border-neutral-400",
      },
    };
    return colorMap[c] || colorMap.primary;
  });

  const variantClasses = createMemo(() => {
    const cs = colorStyles();
    switch (variant()) {
      case "solid":
        return `
          ${radiusClasses()}
          text-neutral-500 dark:text-neutral-400
          ${cs.hover}
          data-[selected]:bg-white dark:data-[selected]:bg-neutral-700
          data-[selected]:text-neutral-900 dark:data-[selected]:text-neutral-100
          data-[selected]:shadow-sm
        `;
      case "underlined":
        return `
          border-b-2 border-transparent -mb-px
          text-neutral-500 dark:text-neutral-400
          ${cs.hover}
          data-[selected]:${cs.border}
          data-[selected]:${cs.selected}
        `;
      case "bordered":
        return `
          ${radiusClasses()}
          text-neutral-500 dark:text-neutral-400
          ${cs.hover}
          data-[selected]:${cs.selectedBg}
          data-[selected]:text-white
        `;
      case "light":
        return `
          ${radiusClasses()}
          text-neutral-500 dark:text-neutral-400
          hover:bg-neutral-100 dark:hover:bg-neutral-800
          ${cs.hover}
          data-[selected]:${cs.selectedBgLight}
          data-[selected]:${cs.selected}
        `;
      default:
        return "";
    }
  });

  const animationClasses = () => {
    if (local.disableAnimation) return "";
    return "transition-all duration-200";
  };

  return (
    <KobalteTabs.Trigger
      value={local.value}
      disabled={local.isDisabled}
      class={`
        relative z-10
        flex-1
        flex items-center justify-center
        font-medium
        ${animationClasses()}
        outline-none
        focus-visible:z-20
        focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        cursor-pointer
        ${sizeClasses()}
        ${variantClasses()}
        ${local.class || ""}
      `}
      {...others}
    >
      {local.children}
    </KobalteTabs.Trigger>
  );
}

export interface TabPanelProps {
  /** Panel value (must match corresponding Tab value) */
  value: string;
  /** Whether to disable animation */
  disableAnimation?: boolean;
  /** Additional class name */
  class?: string;
  /** Panel content */
  children: JSX.Element;
}

export function TabPanel(props: TabPanelProps) {
  const [local, others] = splitProps(props, ["value", "disableAnimation", "class", "children"]);

  const animationClasses = () => {
    if (local.disableAnimation) return "";
    return "animate-[fadeIn_0.3s_ease-out]";
  };

  return (
    <KobalteTabs.Content
      value={local.value}
      class={`
        mt-4 py-2
        outline-none
        focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        ${animationClasses()}
        ${local.class || ""}
      `}
      {...others}
    >
      {local.children}
    </KobalteTabs.Content>
  );
}
