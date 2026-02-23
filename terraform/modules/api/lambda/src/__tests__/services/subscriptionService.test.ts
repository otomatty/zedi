import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, TEST_USER_ID, type MockDb } from "../helpers/setup";

let mockDb: MockDb;

beforeEach(() => {
  mockDb = createMockDb();
  vi.useRealTimers();
});

describe("subscriptionService", () => {
  describe("getUserTier", () => {
    it("returns pro when active subscription exists", async () => {
      const userId = `user-pro-${Date.now()}`;
      mockDb.limit.mockResolvedValueOnce([{ plan: "pro" }]);

      const { getUserTier } = await import("../../services/subscriptionService");
      const tier = await getUserTier(userId, mockDb as unknown);

      expect(tier).toBe("pro");
    });

    it("returns free when no subscription exists", async () => {
      const userId = `user-free-${Date.now()}`;
      mockDb.limit.mockResolvedValueOnce([]);

      const { getUserTier } = await import("../../services/subscriptionService");
      const tier = await getUserTier(userId, mockDb as unknown);

      expect(tier).toBe("free");
    });

    it("returns cached value within TTL", async () => {
      vi.useFakeTimers();
      const userId = `user-cached-${vi.getMockedSystemTime()?.getTime() ?? 0}`;

      mockDb.limit.mockResolvedValueOnce([{ plan: "pro" }]);

      const { getUserTier } = await import("../../services/subscriptionService");

      const first = await getUserTier(userId, mockDb as unknown);
      expect(first).toBe("pro");

      vi.advanceTimersByTime(10_000);

      const second = await getUserTier(userId, mockDb as unknown);
      expect(second).toBe("pro");
      expect(mockDb.limit).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after cache TTL expires", async () => {
      vi.useFakeTimers();
      const userId = `user-ttl-${vi.getMockedSystemTime()?.getTime() ?? 1}`;

      mockDb.limit
        .mockResolvedValueOnce([{ plan: "pro" }])
        .mockResolvedValueOnce([{ plan: "free" }]);

      const { getUserTier } = await import("../../services/subscriptionService");

      const first = await getUserTier(userId, mockDb as unknown);
      expect(first).toBe("pro");

      vi.advanceTimersByTime(31_000);

      const second = await getUserTier(userId, mockDb as unknown);
      expect(second).toBe("free");
    });
  });

  describe("getSubscription", () => {
    it("returns subscription when exists", async () => {
      const sub = { id: "sub-1", userId: TEST_USER_ID, plan: "pro", status: "active" };
      mockDb.limit.mockResolvedValueOnce([sub]);

      const { getSubscription } = await import("../../services/subscriptionService");
      const result = await getSubscription(TEST_USER_ID, mockDb as unknown);

      expect(result).toEqual(sub);
    });

    it("returns null when no subscription", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const { getSubscription } = await import("../../services/subscriptionService");
      const result = await getSubscription(TEST_USER_ID, mockDb as unknown);

      expect(result).toBeNull();
    });
  });
});
