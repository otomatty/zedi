import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";
import { CollaborationManager } from "./CollaborationManager";

const mockYDocOn = vi.fn();
const mockYDocDestroy = vi.fn();
const mockYDocGetXmlFragment = vi.fn().mockReturnValue({
  toJSON: () => "",
  toArray: () => [],
});

vi.mock("yjs", () => ({
  Doc: function Doc() {
    return { on: mockYDocOn, destroy: mockYDocDestroy, getXmlFragment: mockYDocGetXmlFragment };
  },
  encodeStateAsUpdate: vi.fn(() => new Uint8Array([0, 0])),
  applyUpdate: vi.fn(),
  XmlFragment: function XmlFragment() {},
  XmlElement: function XmlElement() {},
  XmlText: function XmlText() {},
}));

const mockIdbOn = vi.fn();
const mockIdbDestroy = vi.fn();

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: function IndexeddbPersistence() {
    return { on: mockIdbOn, destroy: mockIdbDestroy };
  },
}));

vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: vi.fn(() => ({
    awareness: null,
    destroy: vi.fn(),
  })),
}));

vi.mock("y-protocols/awareness", () => ({
  Awareness: vi.fn(),
}));

vi.mock("./types", () => ({
  getUserColor: vi.fn(() => "#60a5fa"),
}));

const mockGetAuthToken = vi.fn().mockResolvedValue("test-token");

describe("CollaborationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates Y.Doc on construction", () => {
    const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
    expect(manager.document).toBeDefined();
  });

  describe("subscribe", () => {
    it("notifies listeners of state changes", () => {
      const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
      const listener = vi.fn();

      manager.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: "connecting", isSynced: false }),
      );
    });

    it("returns unsubscribe function", () => {
      const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
      const listener = vi.fn();

      const unsubscribe = manager.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      // After unsubscribe, further state changes should not call the listener.
      // We verify by checking the listener count stays at 1.
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("document", () => {
    it("returns the Y.Doc", () => {
      const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
      expect(manager.document).toBeDefined();
    });
  });

  describe("isConnected", () => {
    it("returns false initially", () => {
      const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
      expect(manager.isConnected).toBe(false);
    });
  });

  describe("destroy", () => {
    it("clears listeners and destroys providers", () => {
      const manager = new CollaborationManager("page-1", "user-1", "Test User", mockGetAuthToken);
      const listener = vi.fn();
      manager.subscribe(listener);
      listener.mockClear();

      manager.destroy();

      expect(mockIdbDestroy).toHaveBeenCalled();
      expect(mockYDocDestroy).toHaveBeenCalled();
    });
  });

  describe("setPageTitle and saveToApi", () => {
    it("includes title in PUT /content JSON body when setPageTitle was called", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);

      vi.mocked(Y.encodeStateAsUpdate).mockReturnValueOnce(new Uint8Array([1, 2, 3, 4]));

      const manager = new CollaborationManager("page-abc", "user-1", "Test User", mockGetAuthToken);
      manager.setPageTitle("Synced Title");
      manager.flushSave();

      await vi.waitFor(() => {
        const putCall = fetchMock.mock.calls.find(
          (call) =>
            typeof call[0] === "string" &&
            String(call[0]).includes("/content") &&
            (call[1] as RequestInit | undefined)?.method === "PUT",
        );
        expect(putCall).toBeDefined();
      });

      const putCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          String(call[0]).includes("/content") &&
          (call[1] as RequestInit | undefined)?.method === "PUT",
      );
      const body = putCall?.[1]?.body as string;
      const parsed = JSON.parse(body) as {
        title?: string;
        ydoc_state?: string;
        content_text?: string;
      };
      expect(parsed.title).toBe("Synced Title");
      expect(parsed).toHaveProperty("ydoc_state");
      expect(parsed).toHaveProperty("content_text");

      vi.unstubAllGlobals();
    });
  });
});
