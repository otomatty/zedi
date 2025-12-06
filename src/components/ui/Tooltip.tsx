import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import { type JSX, splitProps, Show } from "solid-js";

export interface TooltipProps {
  /** Tooltip content */
  content: JSX.Element;
  /** Trigger element */
  children: JSX.Element;
  /** Tooltip placement */
  placement?: "top" | "bottom" | "left" | "right";
  /** Delay before showing (ms) */
  delay?: number;
  /** Whether to show arrow */
  showArrow?: boolean;
  /** Additional class name for content */
  class?: string;
}

export function Tooltip(props: TooltipProps) {
  const [local, others] = splitProps(props, [
    "content",
    "children",
    "placement",
    "delay",
    "showArrow",
    "class",
  ]);

  const placement = () => local.placement || "top";
  const showArrow = () => local.showArrow !== false;

  return (
    <KobalteTooltip
      placement={placement()}
      openDelay={local.delay ?? 300}
      closeDelay={0}
      {...others}
    >
      <KobalteTooltip.Trigger as="span" class="inline-flex">
        {local.children}
      </KobalteTooltip.Trigger>
      <KobalteTooltip.Portal>
        <KobalteTooltip.Content
          class={`
            px-3 py-1.5
            bg-neutral-900 dark:bg-neutral-100
            text-white dark:text-neutral-900
            text-sm font-medium
            rounded-lg
            shadow-lg
            z-[var(--z-tooltip)]
            animate-[fade-in_0.15s_ease-out]
            ${local.class || ""}
          `}
        >
          <Show when={showArrow()}>
            <KobalteTooltip.Arrow class="fill-neutral-900 dark:fill-neutral-100" />
          </Show>
          {local.content}
        </KobalteTooltip.Content>
      </KobalteTooltip.Portal>
    </KobalteTooltip>
  );
}
