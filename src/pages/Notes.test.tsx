/**
 * Regression tests for the `?new=1` deep-link handling on the `Notes` page
 * (issue #827, gemini / codex review on PR #834). The header NoteSwitcher
 * sends users to `/notes?new=1` to open the create-note dialog. The hook
 * must fire `onOpen` both on first mount AND when the URL transitions
 * `/notes` → `/notes?new=1` while `Notes` is already mounted, then strip
 * the param so a refresh does not reopen the dialog.
 *
 * `Notes` ページの `?new=1` ディープリンク処理の退行テスト
 * （issue #827・PR #834 の gemini / codex レビュー指摘）。
 * ヘッダーの NoteSwitcher は `/notes?new=1` に遷移して新規作成ダイアログを
 * 開かせる。フックは「初回マウント時」と「`Notes` がマウントされたまま
 * `/notes` → `/notes?new=1` に遷移した場合」の両方で `onOpen` を発火し、
 * リロード時に再オープンしないようクエリを除去しなければならない。
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import { useNewNoteDeepLink } from "./Notes";

function wrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  };
}

describe("useNewNoteDeepLink", () => {
  it("fires onOpen and strips ?new=1 when the page first mounts with the param", () => {
    const onOpen = vi.fn();
    let observedSearch = "";
    const { result } = renderHook(
      () => {
        observedSearch = useLocation().search;
        useNewNoteDeepLink(onOpen);
        return useNavigate();
      },
      { wrapper: wrapper(["/notes?new=1&keep=yes"]) },
    );

    expect(onOpen).toHaveBeenCalledTimes(1);
    // The `new` param is gone but unrelated params (`keep`) remain intact.
    // `new` だけ除去され、無関係なクエリ（`keep`）は残る。
    expect(observedSearch).toBe("?keep=yes");
    // Hook should not call onOpen again on subsequent renders without a
    // fresh `?new=1`.
    // 以降のレンダーで `?new=1` が無い限り onOpen は再発火しない。
    void result.current;
  });

  it("fires onOpen when ?new=1 appears after mount (route stays on /notes)", () => {
    const onOpen = vi.fn();
    let navigateRef: ReturnType<typeof useNavigate> | null = null;
    let observedSearch = "";

    renderHook(
      () => {
        navigateRef = useNavigate();
        observedSearch = useLocation().search;
        useNewNoteDeepLink(onOpen);
      },
      { wrapper: wrapper(["/notes"]) },
    );

    // Initial mount on `/notes` (no `new` param) should not fire.
    // 初期マウントは `?new=1` 無しなので発火しない。
    expect(onOpen).not.toHaveBeenCalled();
    expect(observedSearch).toBe("");

    // Simulate the header NoteSwitcher pushing `/notes?new=1` while the
    // page is still mounted.
    // ヘッダーの NoteSwitcher が `/notes?new=1` を push したのを再現する。
    act(() => {
      navigateRef?.("/notes?new=1");
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    // Hook strips the param after firing.
    // 発火後にクエリが除去されている。
    expect(observedSearch).toBe("");
  });

  it("does nothing when ?new is missing", () => {
    const onOpen = vi.fn();
    renderHook(() => useNewNoteDeepLink(onOpen), { wrapper: wrapper(["/notes"]) });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does nothing when ?new has a non-1 value", () => {
    const onOpen = vi.fn();
    renderHook(() => useNewNoteDeepLink(onOpen), {
      wrapper: wrapper(["/notes?new=0"]),
    });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
