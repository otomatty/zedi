import "@testing-library/jest-dom/vitest";

/**
 * jsdom does not implement `window.matchMedia`. Provide a minimal stub so
 * hooks like `useIsMobile` can call it during tests. Individual tests can
 * override this with `vi.fn()` to assert subscription / change behaviour.
 *
 * jsdom には `window.matchMedia` が無いため、`useIsMobile` などが落ちないよう
 * 最小限のスタブを差し込む。挙動を検証するテストは個別に上書きする。
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
