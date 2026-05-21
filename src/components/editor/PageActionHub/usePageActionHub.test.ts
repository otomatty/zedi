import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePageActionHub } from "./usePageActionHub";

describe("usePageActionHub", () => {
  it("初期状態は閉じておりビューは list / starts closed on the list view", () => {
    const { result } = renderHook(() => usePageActionHub());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.view).toEqual({ kind: "list" });
  });

  it("open() で isOpen=true かつ list にリセット / open() opens and resets to list", () => {
    const { result } = renderHook(() => usePageActionHub());
    act(() => {
      result.current.selectAction("thumbnail.search");
    });
    expect(result.current.view).toEqual({ kind: "detail", actionId: "thumbnail.search" });

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.view).toEqual({ kind: "list" });
  });

  it("selectAction(id) は detail に遷移 / selectAction navigates to detail", () => {
    const { result } = renderHook(() => usePageActionHub());
    act(() => {
      result.current.open();
      result.current.selectAction("thumbnail.generate");
    });
    expect(result.current.view).toEqual({ kind: "detail", actionId: "thumbnail.generate" });
  });

  it("backToList() で list に戻る / backToList returns to list", () => {
    const { result } = renderHook(() => usePageActionHub());
    act(() => {
      result.current.open();
      result.current.selectAction("thumbnail.search");
      result.current.backToList();
    });
    expect(result.current.view).toEqual({ kind: "list" });
  });

  it("handleOpenChange(false) は閉じてビューも list に戻す / closing resets view", () => {
    const { result } = renderHook(() => usePageActionHub());
    act(() => {
      result.current.open();
      result.current.selectAction("thumbnail.search");
      result.current.handleOpenChange(false);
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.view).toEqual({ kind: "list" });
  });

  it("close() でも閉じてビューが list に戻る / close() resets view", () => {
    const { result } = renderHook(() => usePageActionHub());
    act(() => {
      result.current.open();
      result.current.selectAction("thumbnail.generate");
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.view).toEqual({ kind: "list" });
  });
});
