import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readPendingInitialPayload,
  clearPendingInitialPayload,
  hasPendingLandingPayload,
} from "./aiChatDetailLandingPayload";
import { aiChatInitialPayloadStorageKey } from "@/constants/aiChatSidebar";

const store = new Map<string, string>();

function createSessionStorageMock() {
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    length: 0,
    key: vi.fn(),
  };
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", createSessionStorageMock());
});

describe("readPendingInitialPayload", () => {
  it("prefers router state when initialMessage is non-empty", () => {
    const state = { initialMessage: "  hello  ", initialReferencedPages: [] };
    expect(readPendingInitialPayload("c1", state)).toEqual(state);
  });

  it("reads from sessionStorage when state has no message", () => {
    const key = aiChatInitialPayloadStorageKey("c1");
    const payload = { initialMessage: "from storage", initialReferencedPages: [] as unknown[] };
    store.set(key, JSON.stringify(payload));

    expect(readPendingInitialPayload("c1", {})).toEqual(payload);
  });

  it("returns null when sessionStorage has invalid JSON", () => {
    const key = aiChatInitialPayloadStorageKey("c1");
    store.set(key, "not-json{");

    expect(readPendingInitialPayload("c1", {})).toBeNull();
  });

  it("returns null when parsed payload has empty initialMessage", () => {
    const key = aiChatInitialPayloadStorageKey("c1");
    store.set(key, JSON.stringify({ initialMessage: "   " }));

    expect(readPendingInitialPayload("c1", {})).toBeNull();
  });

  it("returns null when key missing", () => {
    expect(readPendingInitialPayload("c1", {})).toBeNull();
  });
});

describe("clearPendingInitialPayload", () => {
  it("removes sessionStorage key", () => {
    const key = aiChatInitialPayloadStorageKey("c1");
    store.set(key, "{}");
    clearPendingInitialPayload("c1");
    expect(store.has(key)).toBe(false);
  });
});

describe("hasPendingLandingPayload", () => {
  it("is true when state has trimmable initialMessage", () => {
    expect(hasPendingLandingPayload("c1", { initialMessage: "x" })).toBe(true);
  });

  it("is false when no state and no storage", () => {
    expect(hasPendingLandingPayload("c1", {})).toBe(false);
  });
});
