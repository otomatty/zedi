/**
 * SidebarProvider のテスト。
 * - 初期値（cookie / defaultOpen）の解決
 * - open/close の cookie 永続化
 * - controlled モード（open prop / onOpenChange）
 * - キーボードショートカット（Ctrl/Meta + b）
 *
 * Tests for SidebarProvider.
 */
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SidebarProvider } from "./SidebarProvider";
import { useSidebar } from "./useSidebar";
import { SIDEBAR_COOKIE_NAME, SIDEBAR_KEYBOARD_SHORTCUT } from "./sidebarConstants";

function clearCookies(): void {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

interface ProbeProps {
  onCtx?: (ctx: ReturnType<typeof useSidebar>) => void;
}

function Probe({ onCtx }: ProbeProps): React.JSX.Element {
  const ctx = useSidebar();
  onCtx?.(ctx);
  return (
    <div>
      <span data-testid="state">{ctx.state}</span>
      <span data-testid="open">{String(ctx.open)}</span>
      <button type="button" data-testid="toggle" onClick={ctx.toggleSidebar}>
        toggle
      </button>
    </div>
  );
}

describe("SidebarProvider initial state", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("Cookie が無ければ defaultOpen に従う / falls back to defaultOpen", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
  });

  it("Cookie の値が defaultOpen より優先される / cookie wins over defaultOpen", () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=true; path=/`;
    render(
      <SidebarProvider defaultOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("open").textContent).toBe("true");
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });
});

describe("SidebarProvider toggle / cookie persistence", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("toggleSidebar で開閉が切り替わり cookie に永続化される", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("open").textContent).toBe("false");

    act(() => {
      screen.getByTestId("toggle").click();
    });

    expect(screen.getByTestId("open").textContent).toBe("true");
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=true`);
  });
});

describe("SidebarProvider controlled mode", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("open prop で controlled になり、toggle は onOpenChange を呼ぶ", () => {
    const onOpenChange = vi.fn();
    function Wrapper(): React.JSX.Element {
      const [open, setOpen] = React.useState(true);
      return (
        <SidebarProvider
          open={open}
          onOpenChange={(v) => {
            onOpenChange(v);
            setOpen(v);
          }}
        >
          <Probe />
        </SidebarProvider>
      );
    }
    render(<Wrapper />);
    expect(screen.getByTestId("open").textContent).toBe("true");

    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("open").textContent).toBe("false");
  });
});

describe("SidebarProvider keyboard shortcut", () => {
  beforeEach(() => {
    clearCookies();
  });

  function dispatchShortcut(modifier: "ctrl" | "meta", target?: HTMLElement): KeyboardEvent {
    const evt = new KeyboardEvent("keydown", {
      key: SIDEBAR_KEYBOARD_SHORTCUT,
      ctrlKey: modifier === "ctrl",
      metaKey: modifier === "meta",
      bubbles: true,
      cancelable: true,
    });
    (target ?? window).dispatchEvent(evt);
    return evt;
  }

  it("Ctrl+B でトグルされ preventDefault される", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    let evt: KeyboardEvent | undefined;
    act(() => {
      evt = dispatchShortcut("ctrl");
    });
    expect(screen.getByTestId("open").textContent).toBe("true");
    expect(evt?.defaultPrevented).toBe(true);
  });

  it("Meta+B でも動作する / works with Meta key as well", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Probe />
      </SidebarProvider>,
    );
    act(() => {
      dispatchShortcut("meta");
    });
    expect(screen.getByTestId("open").textContent).toBe("true");
  });

  it("INPUT にフォーカス中はショートカットを無視する / ignores shortcut while typing in inputs", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <input data-testid="input" />
        <Probe />
      </SidebarProvider>,
    );

    const input = screen.getByTestId("input") as HTMLInputElement;
    input.focus();

    act(() => {
      const evt = new KeyboardEvent("keydown", {
        key: SIDEBAR_KEYBOARD_SHORTCUT,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(evt);
    });

    expect(screen.getByTestId("open").textContent).toBe("false");
  });

  it("contenteditable 要素でも無視する / ignores shortcut on contenteditable", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <div data-testid="editor" contentEditable />
        <Probe />
      </SidebarProvider>,
    );

    const editor = screen.getByTestId("editor");
    act(() => {
      const evt = new KeyboardEvent("keydown", {
        key: SIDEBAR_KEYBOARD_SHORTCUT,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(evt);
    });

    expect(screen.getByTestId("open").textContent).toBe("false");
  });
});
