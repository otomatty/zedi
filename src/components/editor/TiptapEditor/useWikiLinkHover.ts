import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/core";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
const TYPING_SUPPRESS_MS = 500;
const LONG_PRESS_MS = 500;

/**
 * ホバーカードの表示対象となる WikiLink 情報。
 * WikiLink information targeted by the hover card.
 */
export interface HoverTarget {
  /** リンクタイトル / Link title */
  title: string;
  /** ページが存在するか / Whether the page exists */
  exists: boolean;
  /** 他ページから参照されているか / Referenced from other pages */
  referenced: boolean;
  /** 対象要素の画面上の位置 / Bounding rect of the hovered element */
  rect: DOMRect;
}

/**
 * エディタ内 WikiLink のホバー検出ロジック（イベント委譲・長押し・入力抑制）。
 * Event delegation, long-press detection, and typing suppression for WikiLink hover.
 */
export function useWikiLinkHover(
  editor: Editor | null,
  editorContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [target, setTarget] = useState<HoverTarget | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number>();
  const closeTimerRef = useRef<number>();
  const currentElementRef = useRef<HTMLElement | null>(null);
  const lastKeyTimeRef = useRef(0);
  const longPressTimerRef = useRef<number>();

  const closeCard = useCallback(() => {
    clearTimeout(openTimerRef.current);
    clearTimeout(closeTimerRef.current);
    setIsVisible(false);
    setTarget(null);
    currentElementRef.current = null;
  }, []);

  const openCard = useCallback((el: HTMLElement) => {
    const title = el.getAttribute("data-title");
    if (!title) return;
    const exists = el.getAttribute("data-exists") === "true";
    const referenced = el.getAttribute("data-referenced") === "true";
    const rect = el.getBoundingClientRect();
    setTarget({ title, exists, referenced, rect });
    setIsVisible(true);
  }, []);

  // 入力中はカードを非表示にする / Suppress card during active typing
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = () => {
      lastKeyTimeRef.current = Date.now();
      if (isVisible) closeCard();
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, isVisible, closeCard]);

  // スクロール時にカードを閉じる / Close on scroll
  useEffect(() => {
    if (!isVisible) return;
    const onScroll = () => closeCard();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [isVisible, closeCard]);

  // マウスホバー＋タッチ長押しのイベント委譲 / Mouse hover + touch long-press event delegation
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const onMouseOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-wiki-link]") as HTMLElement | null;
      if (el && el !== currentElementRef.current) {
        currentElementRef.current = el;
        clearTimeout(closeTimerRef.current);
        clearTimeout(openTimerRef.current);
        if (editor?.isEditable && Date.now() - lastKeyTimeRef.current < TYPING_SUPPRESS_MS) return;
        openTimerRef.current = window.setTimeout(() => openCard(el), OPEN_DELAY_MS);
      } else if (el && el === currentElementRef.current) {
        // ホバーカードから同じ WikiLink へ戻ったとき、カード側 mouseleave で開始した閉じタイマーを止める。
        // Cancel close timer started from the card when the pointer returns to the same wiki-link.
        clearTimeout(closeTimerRef.current);
      } else if (!el && !cardRef.current?.contains(e.target as Node)) {
        clearTimeout(openTimerRef.current);
        currentElementRef.current = null;
        closeTimerRef.current = window.setTimeout(() => {
          setIsVisible(false);
          setTarget(null);
        }, CLOSE_DELAY_MS);
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (cardRef.current?.contains(related)) {
        clearTimeout(closeTimerRef.current);
        return;
      }
      if (related?.closest?.("[data-wiki-link]") === currentElementRef.current) return;
      clearTimeout(openTimerRef.current);
      currentElementRef.current = null;
      closeTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setTarget(null);
      }, CLOSE_DELAY_MS);
    };

    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-wiki-link]") && isVisible) closeCard();
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = (e.target as HTMLElement).closest("[data-wiki-link]") as HTMLElement | null;
      if (!el) return;
      longPressTimerRef.current = window.setTimeout(() => openCard(el), LONG_PRESS_MS);
    };
    const onTouchEnd = () => clearTimeout(longPressTimerRef.current);
    const onTouchMove = () => clearTimeout(longPressTimerRef.current);

    container.addEventListener("mouseover", onMouseOver);
    container.addEventListener("mouseout", onMouseOut);
    container.addEventListener("click", onClick);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      container.removeEventListener("mouseover", onMouseOver);
      container.removeEventListener("mouseout", onMouseOut);
      container.removeEventListener("click", onClick);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchmove", onTouchMove);
      clearTimeout(openTimerRef.current);
      clearTimeout(closeTimerRef.current);
      clearTimeout(longPressTimerRef.current);
    };
  }, [editorContainerRef, editor, openCard, closeCard, isVisible]);

  // モバイル: 外部タッチで閉じる / Close on outside touch (mobile)
  useEffect(() => {
    if (!isVisible) return;
    let listener: ((e: TouchEvent) => void) | null = null;
    const timer = window.setTimeout(() => {
      listener = (e: TouchEvent) => {
        if (cardRef.current?.contains(e.target as Node)) return;
        closeCard();
      };
      document.addEventListener("touchstart", listener);
    }, 100);
    return () => {
      clearTimeout(timer);
      if (listener) document.removeEventListener("touchstart", listener);
    };
  }, [isVisible, closeCard]);

  /** カードにマウスが入ったとき閉じタイマーをキャンセル / Cancel close timer on card mouse enter */
  const handleCardMouseEnter = useCallback(() => {
    clearTimeout(closeTimerRef.current);
  }, []);

  /** カードからマウスが離れたとき閉じタイマーを開始 / Start close timer on card mouse leave */
  const handleCardMouseLeave = useCallback(() => {
    closeTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      setTarget(null);
      currentElementRef.current = null;
    }, CLOSE_DELAY_MS);
  }, []);

  return {
    target,
    isVisible,
    cardRef,
    closeCard,
    handleCardMouseEnter,
    handleCardMouseLeave,
  };
}
