/**
 * Tests for the shared primary navigation config. The header dropdown and
 * mobile bottom navigation both consume {@link PRIMARY_NAV_ITEMS}, so this
 * suite guards the canonical shape and entries.
 *
 * 共通のプライマリナビ設定 {@link PRIMARY_NAV_ITEMS} のテスト。ヘッダーのドロップダウンと
 * モバイルのボトムナビが同じ配列を参照するため、型と項目内容の単一ソースを保証する。
 */
import { describe, it, expect } from "vitest";
import { PRIMARY_NAV_ITEMS, isPrimaryNavActive, type PrimaryNavItem } from "./navigationItems";

describe("PRIMARY_NAV_ITEMS", () => {
  it("exposes Home, Notes, and AI as the canonical primary entries", () => {
    const paths = PRIMARY_NAV_ITEMS.map((item) => item.path);
    expect(paths).toEqual(["/home", "/notes", "/ai"]);
  });

  it("assigns an i18n key and an icon component to every entry", () => {
    for (const item of PRIMARY_NAV_ITEMS) {
      expect(item.i18nKey).toMatch(/^nav\./);
      // lucide-react icons are forwardRef components, so `typeof` can be
      // either "function" or "object" depending on React internals.
      // lucide-react のアイコンは forwardRef コンポーネントで `typeof` が
      // "function" にも "object" にもなり得るため、存在のみを検証する。
      expect(item.icon).toBeTruthy();
    }
  });

  it("uses unique paths across entries", () => {
    const paths = PRIMARY_NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("covers /ai, /ai/:conversationId, and /ai/history via matchPaths", () => {
    const ai = PRIMARY_NAV_ITEMS.find((item) => item.path === "/ai");
    expect(ai?.matchPaths).toEqual(["/ai", "/ai/:conversationId", "/ai/history"]);
  });
});

describe("isPrimaryNavActive", () => {
  const homeItem = PRIMARY_NAV_ITEMS.find((item) => item.path === "/home") as PrimaryNavItem;
  const aiItem = PRIMARY_NAV_ITEMS.find((item) => item.path === "/ai") as PrimaryNavItem;

  it("returns true when any matchPath matches the current pathname", () => {
    expect(isPrimaryNavActive(aiItem, "/ai")).toBe(true);
    expect(isPrimaryNavActive(aiItem, "/ai/conv-123")).toBe(true);
    expect(isPrimaryNavActive(aiItem, "/ai/history")).toBe(true);
  });

  it("falls back to an exact path match when matchPaths is not provided", () => {
    expect(isPrimaryNavActive(homeItem, "/home")).toBe(true);
    expect(isPrimaryNavActive(homeItem, "/home/anything")).toBe(false);
  });

  it("returns false for unrelated pathnames", () => {
    expect(isPrimaryNavActive(homeItem, "/notes")).toBe(false);
    expect(isPrimaryNavActive(aiItem, "/settings")).toBe(false);
  });
});
