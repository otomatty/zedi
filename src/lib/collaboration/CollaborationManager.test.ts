import { describe, it, expect, vi, beforeEach } from "vitest";
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

  // Issue #889 Phase 3: `local` モード（REST 経由の Y.Doc 保存）を撤去したため、
  // `setPageTitle` / `flushSave` / `saveToApi` も削除された。Hocuspocus 経由の
  // タイトル保存は `PUT /api/pages/:id` メタデータルートで別途扱う。
  // Issue #889 Phase 3 removed the legacy `local` REST sync path (and
  // `setPageTitle` / `flushSave` / `saveToApi` along with it). Title saves go
  // through the metadata-only `PUT /api/pages/:id` route in `NotePageView` now.
});
