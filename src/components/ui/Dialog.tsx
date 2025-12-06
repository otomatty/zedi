import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { type JSX, splitProps } from "solid-js";

// Re-export Dialog root components
export const Dialog = KobalteDialog;
export const DialogTrigger = KobalteDialog.Trigger;
export const DialogPortal = KobalteDialog.Portal;

export interface DialogOverlayProps {
  class?: string;
}

export function DialogOverlay(props: DialogOverlayProps) {
  return (
    <KobalteDialog.Overlay
      class={`
        fixed inset-0
        bg-black/50
        backdrop-blur-sm
        z-[var(--z-overlay)]
        animate-[fade-in_0.2s_ease-out]
        ${props.class || ""}
      `}
    />
  );
}

export interface DialogContentProps {
  children: JSX.Element;
  class?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function DialogContent(props: DialogContentProps) {
  const [local, others] = splitProps(props, ["children", "class", "size"]);
  const size = () => local.size || "md";

  const sizeClasses = () => {
    switch (size()) {
      case "sm":
        return "max-w-sm";
      case "md":
        return "max-w-md";
      case "lg":
        return "max-w-lg";
      case "xl":
        return "max-w-xl";
      case "full":
        return "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]";
      default:
        return "max-w-md";
    }
  };

  return (
    <KobalteDialog.Content
      class={`
        fixed
        top-1/2 left-1/2
        -translate-x-1/2 -translate-y-1/2
        w-full ${sizeClasses()}
        bg-[var(--bg-card)]
        rounded-2xl
        shadow-2xl
        z-[var(--z-modal)]
        animate-[scale-in_0.2s_ease-out]
        outline-none
        overflow-hidden
        ${local.class || ""}
      `}
      {...others}
    >
      {local.children}
    </KobalteDialog.Content>
  );
}

export interface DialogHeaderProps {
  children: JSX.Element;
  class?: string;
}

export function DialogHeader(props: DialogHeaderProps) {
  return (
    <div class={`px-6 py-4 border-b border-[var(--border-subtle)] ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DialogBodyProps {
  children: JSX.Element;
  class?: string;
}

export function DialogBody(props: DialogBodyProps) {
  return (
    <div class={`px-6 py-4 ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DialogFooterProps {
  children: JSX.Element;
  class?: string;
}

export function DialogFooter(props: DialogFooterProps) {
  return (
    <div class={`px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3 ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DialogTitleProps {
  children: JSX.Element;
  class?: string;
}

export function DialogTitle(props: DialogTitleProps) {
  return (
    <KobalteDialog.Title
      class={`text-lg font-semibold text-[var(--text-primary)] ${props.class || ""}`}
    >
      {props.children}
    </KobalteDialog.Title>
  );
}

export interface DialogDescriptionProps {
  children: JSX.Element;
  class?: string;
}

export function DialogDescription(props: DialogDescriptionProps) {
  return (
    <KobalteDialog.Description
      class={`text-sm text-[var(--text-secondary)] mt-1 ${props.class || ""}`}
    >
      {props.children}
    </KobalteDialog.Description>
  );
}

export interface DialogCloseButtonProps {
  class?: string;
}

export function DialogCloseButton(props: DialogCloseButtonProps) {
  return (
    <KobalteDialog.CloseButton
      class={`
        absolute top-4 right-4
        w-8 h-8
        flex items-center justify-center
        rounded-full
        text-[var(--text-tertiary)]
        hover:text-[var(--text-primary)]
        hover:bg-neutral-100 dark:hover:bg-neutral-800
        transition-colors duration-150
        outline-none
        focus-visible:ring-2 focus-visible:ring-primary-500
        ${props.class || ""}
      `}
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </KobalteDialog.CloseButton>
  );
}
