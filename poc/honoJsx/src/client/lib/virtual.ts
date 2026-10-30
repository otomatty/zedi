import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";
import { useLayoutEffect, useReducer, useState } from "hono/jsx/dom";

type Options = Pick<
  VirtualizerOptions<HTMLElement, Element>,
  "count" | "getScrollElement" | "estimateSize" | "overscan"
>;

/**
 * hono/jsx/dom binding for `@tanstack/virtual-core` (mirrors the official React adapter).
 * `@tanstack/virtual-core` を hono/jsx/dom から使うアダプタ。
 */
export function useVirtualizer(options: Options): Virtualizer<HTMLElement, Element> {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const resolved: VirtualizerOptions<HTMLElement, Element> = {
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    ...options,
    onChange: () => rerender(undefined),
  };
  const [instance] = useState(() => new Virtualizer(resolved));
  instance.setOptions(resolved);

  useLayoutEffect(() => instance._didMount(), [instance]);
  useLayoutEffect(() => {
    instance._willUpdate();
  });
  return instance;
}
