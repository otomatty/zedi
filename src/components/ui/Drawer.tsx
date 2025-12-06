import { Dialog as KobalteDialog } from "@kobalte/core/dialog";
import { type JSX, splitProps } from "solid-js";

// Re-export Drawer root components (built on Dialog)
export const Drawer = KobalteDialog;
export const DrawerTrigger = KobalteDialog.Trigger;
export const DrawerPortal = KobalteDialog.Portal;

export interface DrawerOverlayProps {
  class?: string;
}

export function DrawerOverlay(props: DrawerOverlayProps) {
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

export interface DrawerContentProps {
  children: JSX.Element;
  class?: string;
  showHandle?: boolean;
}

export function DrawerContent(props: DrawerContentProps) {
  const [local, others] = splitProps(props, ["children", "class", "showHandle"]);

  return (
    <KobalteDialog.Content
      class={`
        fixed
        bottom-0 left-0 right-0
        w-full
        max-h-[90vh]
        bg-[var(--bg-card)]
        rounded-t-2xl
        shadow-2xl
        z-[var(--z-modal)]
        outline-none
        overflow-hidden
        animate-[slide-up-drawer_0.3s_ease-out]
        ${local.class || ""}
      `}
      {...others}
    >
      {local.showHandle !== false && (
        <div class="flex justify-center py-3">
          <div class="w-10 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full" />
        </div>
      )}
      {local.children}
    </KobalteDialog.Content>
  );
}

export interface DrawerHeaderProps {
  children: JSX.Element;
  class?: string;
}

export function DrawerHeader(props: DrawerHeaderProps) {
  return (
    <div class={`px-6 py-4 border-b border-[var(--border-subtle)] ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DrawerBodyProps {
  children: JSX.Element;
  class?: string;
}

export function DrawerBody(props: DrawerBodyProps) {
  return (
    <div class={`px-6 py-4 overflow-y-auto ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DrawerFooterProps {
  children: JSX.Element;
  class?: string;
}

export function DrawerFooter(props: DrawerFooterProps) {
  return (
    <div class={`px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3 ${props.class || ""}`}>
      {props.children}
    </div>
  );
}

export interface DrawerTitleProps {
  children: JSX.Element;
  class?: string;
}

export function DrawerTitle(props: DrawerTitleProps) {
  return (
    <KobalteDialog.Title
      class={`text-lg font-semibold text-[var(--text-primary)] ${props.class || ""}`}
    >
      {props.children}
    </KobalteDialog.Title>
  );
}

export interface DrawerDescriptionProps {
  children: JSX.Element;
  class?: string;
}

export function DrawerDescription(props: DrawerDescriptionProps) {
  return (
    <KobalteDialog.Description
      class={`text-sm text-[var(--text-secondary)] mt-1 ${props.class || ""}`}
    >
      {props.children}
    </KobalteDialog.Description>
  );
}

export interface DrawerCloseButtonProps {
  class?: string;
}

export function DrawerCloseButton(props: DrawerCloseButtonProps) {
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
