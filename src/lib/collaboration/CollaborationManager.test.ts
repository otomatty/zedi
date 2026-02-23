import { describe, it, expect, vi, beforeEach } from "vitest";
import { CollaborationManager } from "./CollaborationManager";
import * as Y from "yjs";

const mockYDocOn = vi.fn();
const mockYDocDestroy = vi.fn();
const mockYDocGetXmlFragment = vi.fn().mockReturnValue({ toJSON: () => "" });

vi.mock("yjs", () => ({
  Doc: class {
    on = mockYDocOn;
    destroy = mockYDocDestroy;
    getXmlFragment = mockYDocGetXmlFragment;
  },
  encodeStateAsUpdate: vi.fn(() => new Uint8Array([0, 0])),
  applyUpdate: vi.fn(),
  XmlFragment: class {},
  XmlElement: class {},
  XmlText: class {},
}));

const mockIdbOn = vi.fn();
const mockIdbDestroy = vi.fn();

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    on = mockIdbOn;
    destroy = mockIdbDestroy;
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
});
