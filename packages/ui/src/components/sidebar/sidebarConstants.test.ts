/**
 * sidebarConstants の Cookie パースロジックをテストする。
 * Tests for the cookie parsing logic in sidebarConstants.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  readSidebarOpenFromCookie,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MOBILE,
} from "./sidebarConstants";

function clearCookies(): void {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe("sidebarConstants - module exports", () => {
  it("Cookie 名と max-age（7 日）/ exposes name and 7-day max-age", () => {
    expect(SIDEBAR_COOKIE_NAME).toBe("sidebar:state");
    expect(SIDEBAR_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 7);
  });

  it("ショートカットキーとレイアウト幅の定数 / exposes shortcut and layout widths", () => {
    expect(SIDEBAR_KEYBOARD_SHORTCUT).toBe("b");
    expect(SIDEBAR_WIDTH).toBe("14rem");
    expect(SIDEBAR_WIDTH_MOBILE).toBe("18rem");
    expect(SIDEBAR_WIDTH_ICON).toBe("3rem");
  });
});

describe("readSidebarOpenFromCookie", () => {
  beforeEach(() => {
    clearCookies();
  });

  it("Cookie 未設定なら null / returns null when cookie is not set", () => {
    expect(readSidebarOpenFromCookie()).toBeNull();
  });

  it("`sidebar:state=true` のとき true / returns true when set to 'true'", () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=true; path=/`;
    expect(readSidebarOpenFromCookie()).toBe(true);
  });

  it("`sidebar:state=false` のとき false / returns false when set to 'false'", () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=false; path=/`;
    expect(readSidebarOpenFromCookie()).toBe(false);
  });

  it("値が `true`/`false` 以外のときは null / returns null for other values", () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=open; path=/`;
    expect(readSidebarOpenFromCookie()).toBeNull();
  });

  it("空白付きの Cookie 並びでも正しく解釈する / handles whitespace-separated cookies", () => {
    document.cookie = `other=1; path=/`;
    document.cookie = `${SIDEBAR_COOKIE_NAME}=true; path=/`;
    document.cookie = `another=2; path=/`;
    expect(readSidebarOpenFromCookie()).toBe(true);
  });
});
