import { type JSX, splitProps } from "solid-js";

export interface CardProps {
  children: JSX.Element;
  class?: string;
  /** Card visual variant - HeroUI style */
  variant?: "shadow" | "bordered" | "flat";
  /** Whether the card is hoverable */
  isHoverable?: boolean;
  /** Whether the card is pressable/clickable */
  isPressable?: boolean;
  /** Whether to apply blur effect to footer */
  isFooterBlurred?: boolean;
  /** Whether card has blur background */
  isBlurred?: boolean;
  /** Whether to disable animation */
  disableAnimation?: boolean;
  /** Whether to disable ripple effect */
  disableRipple?: boolean;
  /** Card border radius */
  radius?: "none" | "sm" | "md" | "lg";
  /** Card shadow depth - for shadow variant */
  shadow?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

export function Card(props: CardProps) {
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "variant",
    "isHoverable",
    "isPressable",
    "isFooterBlurred",
    "isBlurred",
    "disableAnimation",
    "radius",
    "shadow",
    "onClick",
  ]);

  const variant = () => local.variant || "shadow";
  const radius = () => local.radius || "lg";
  const shadow = () => local.shadow || "md";

  const baseClasses = `
    relative flex flex-col
    overflow-hidden
    ${local.disableAnimation ? "" : "transition-all duration-300 ease-out"}
  `;

  const variantClasses = () => {
    switch (variant()) {
      case "shadow":
        return "bg-white dark:bg-neutral-900 border-transparent";
      case "bordered":
        return "bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-700";
      case "flat":
        return "bg-neutral-100 dark:bg-neutral-800 border-transparent";
      default:
        return "";
    }
  };

  const shadowClasses = () => {
    if (variant() !== "shadow") return "";
    switch (shadow()) {
      case "none": return "";
      case "sm": return "shadow-sm";
      case "md": return "shadow-md shadow-neutral-500/10 dark:shadow-black/30";
      case "lg": return "shadow-lg shadow-neutral-500/15 dark:shadow-black/40";
      default: return "shadow-md shadow-neutral-500/10 dark:shadow-black/30";
    }
  };

  const radiusClasses = () => {
    switch (radius()) {
      case "none": return "rounded-none";
      case "sm": return "rounded-lg";
      case "md": return "rounded-xl";
      case "lg": return "rounded-2xl";
      default: return "rounded-xl";
    }
  };

  const hoverClasses = () => {
    if (!local.isHoverable && !local.isPressable) return "";
    return `
      hover:shadow-lg hover:shadow-neutral-500/20 dark:hover:shadow-black/50
      hover:-translate-y-1
    `;
  };

  const pressableClasses = () => {
    if (!local.isPressable) return "";
    return `
      cursor-pointer
      active:scale-[0.98]
      focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
    `;
  };

  const blurClasses = () => {
    if (!local.isBlurred) return "";
    return "backdrop-blur-md bg-white/80 dark:bg-neutral-900/80";
  };

  return (
    <div
      class={`
        ${baseClasses} 
        ${variantClasses()} 
        ${shadowClasses()}
        ${radiusClasses()} 
        ${hoverClasses()} 
        ${pressableClasses()}
        ${blurClasses()}
        ${local.class || ""}
      `}
      onClick={local.onClick}
      tabIndex={local.isPressable ? 0 : undefined}
      role={local.isPressable ? "button" : undefined}
      {...others}
    >
      {local.children}
    </div>
  );
}

export interface CardHeaderProps {
  children: JSX.Element;
  class?: string;
}

export function CardHeader(props: CardHeaderProps) {
  return (
    <div class={`flex items-center gap-3 px-4 py-3 ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface CardBodyProps {
  children: JSX.Element;
  class?: string;
}

export function CardBody(props: CardBodyProps) {
  return (
    <div class={`flex-1 px-4 py-3 ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

// Alias for backwards compatibility
export const CardContent = CardBody;

export interface CardFooterProps {
  children: JSX.Element;
  class?: string;
  /** Whether to apply blur effect */
  isBlurred?: boolean;
}

export function CardFooter(props: CardFooterProps) {
  const [local, others] = splitProps(props, ["children", "class", "isBlurred"]);
  
  const blurClasses = () => {
    if (!local.isBlurred) return "";
    return "backdrop-blur-md bg-white/60 dark:bg-neutral-900/60 border-t border-neutral-200/50 dark:border-neutral-700/50";
  };

  return (
    <div 
      class={`px-4 py-3 ${blurClasses()} ${local.class || ""}`}
      {...others}
    >
      {local.children}
    </div>
  );
}

export interface CardTitleProps {
  children: JSX.Element;
  class?: string;
}

export function CardTitle(props: CardTitleProps) {
  return (
    <h3 class={`text-lg font-semibold text-neutral-900 dark:text-neutral-100 ${props.class || ""}`}>
      {props.children}
    </h3>
  );
}

export interface CardDescriptionProps {
  children: JSX.Element;
  class?: string;
}

export function CardDescription(props: CardDescriptionProps) {
  return (
    <p class={`text-sm text-neutral-500 dark:text-neutral-400 ${props.class || ""}`}>
      {props.children}
    </p>
  );
}

export interface CardImageProps {
  src: string;
  alt: string;
  class?: string;
}

export function CardImage(props: CardImageProps) {
  return (
    <div class="relative w-full overflow-hidden">
      <img 
        src={props.src} 
        alt={props.alt}
        class={`w-full h-auto object-cover ${props.class || ""}`}
      />
    </div>
  );
}
