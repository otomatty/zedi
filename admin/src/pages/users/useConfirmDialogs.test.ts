/**
 * useConfirmDialogs のテスト。
 * - 各 dialog の request → confirm / cancel ライフサイクル
 * - getUserImpact の race 対策（requestId）/ guard against stale impact responses
 *
 * Tests for useConfirmDialogs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useConfirmDialogs } from "./useConfirmDialogs";
import type { UserAdmin, UserImpact } from "@/api/admin";

vi.mock("@/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/admin")>();
  return {
    ...actual,
    getUserImpact: vi.fn(),
  };
});

const { getUserImpact } = await import("@/api/admin");

const userA: UserAdmin = {
  id: "user-a",
  email: "a@example.com",
  name: "User A",
  role: "user",
  status: "active",
  suspendedAt: null,
  suspendedReason: null,
  suspendedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  pageCount: 0,
};

const userB: UserAdmin = { ...userA, id: "user-b", email: "b@example.com", name: "User B" };

const sampleImpact: UserImpact = {
  notesCount: 3,
  sessionsCount: 1,
  activeSubscription: false,
  lastAiUsageAt: null,
};

function makeHook() {
  const onRoleChange = vi.fn();
  const onUnsuspend = vi.fn();
  const onDelete = vi.fn();
  const result = renderHook(() => useConfirmDialogs(onRoleChange, onUnsuspend, onDelete));
  return { ...result, onRoleChange, onUnsuspend, onDelete };
}

describe("useConfirmDialogs - role change", () => {
  it("同じロールへの変更は target を立てない / no-op when role is unchanged", () => {
    const { result } = makeHook();
    act(() => {
      result.current.requestRoleChange(userA, "user");
    });
    expect(result.current.roleChangeTarget).toBeNull();
  });

  it("requestRoleChange → confirm で onRoleChange を呼んで target を null に戻す / requestRoleChange then confirm fires onRoleChange and clears target", () => {
    const { result, onRoleChange } = makeHook();
    act(() => {
      result.current.requestRoleChange(userA, "admin");
    });
    expect(result.current.roleChangeTarget).toEqual({ user: userA, newRole: "admin" });

    act(() => {
      result.current.confirmRoleChange();
    });
    expect(onRoleChange).toHaveBeenCalledWith(userA, "admin");
    expect(result.current.roleChangeTarget).toBeNull();
  });

  it("confirm が target なしのときは何もしない / confirm without target is a no-op", () => {
    const { result, onRoleChange } = makeHook();
    act(() => {
      result.current.confirmRoleChange();
    });
    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it("cancel で target を null に戻す / cancel clears target", () => {
    const { result } = makeHook();
    act(() => {
      result.current.requestRoleChange(userA, "admin");
      result.current.cancelRoleChange();
    });
    expect(result.current.roleChangeTarget).toBeNull();
  });
});

describe("useConfirmDialogs - unsuspend", () => {
  it("request → confirm で onUnsuspend を呼ぶ / request then confirm fires onUnsuspend", () => {
    const { result, onUnsuspend } = makeHook();
    act(() => {
      result.current.requestUnsuspend(userA);
    });
    expect(result.current.unsuspendTarget).toEqual(userA);

    act(() => {
      result.current.confirmUnsuspend();
    });
    expect(onUnsuspend).toHaveBeenCalledWith(userA);
    expect(result.current.unsuspendTarget).toBeNull();
  });

  it("cancel で target を null に戻す / cancel clears target", () => {
    const { result } = makeHook();
    act(() => {
      result.current.requestUnsuspend(userA);
      result.current.cancelUnsuspend();
    });
    expect(result.current.unsuspendTarget).toBeNull();
  });
});

describe("useConfirmDialogs - delete with impact", () => {
  beforeEach(() => {
    vi.mocked(getUserImpact).mockReset();
  });

  it("requestDelete でローディング状態 → impact 取得後に impact 反映 / requestDelete shows loading then applies impact once it resolves", async () => {
    vi.mocked(getUserImpact).mockResolvedValueOnce(sampleImpact);
    const { result } = makeHook();

    act(() => {
      result.current.requestDelete(userA);
    });

    expect(result.current.deleteTarget).toEqual({
      user: userA,
      impact: null,
      loadingImpact: true,
    });

    await waitFor(() => {
      expect(result.current.deleteTarget?.loadingImpact).toBe(false);
    });
    expect(result.current.deleteTarget?.impact).toEqual(sampleImpact);
  });

  it("getUserImpact が失敗したら loadingImpact: false で impact は null のまま / when getUserImpact rejects, loadingImpact becomes false and impact stays null", async () => {
    vi.mocked(getUserImpact).mockRejectedValueOnce(new Error("nope"));
    const { result } = makeHook();

    act(() => {
      result.current.requestDelete(userA);
    });
    await waitFor(() => {
      expect(result.current.deleteTarget?.loadingImpact).toBe(false);
    });
    expect(result.current.deleteTarget?.impact).toBeNull();
  });

  it("古い request の resolve は新しい target を上書きしない / stale resolve is ignored", async () => {
    let resolveA: ((v: UserImpact) => void) | null = null;
    let resolveB: ((v: UserImpact) => void) | null = null;
    vi.mocked(getUserImpact)
      .mockImplementationOnce(
        () =>
          new Promise<UserImpact>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<UserImpact>((resolve) => {
            resolveB = resolve;
          }),
      );

    const { result } = makeHook();

    act(() => {
      result.current.requestDelete(userA);
    });
    expect(result.current.deleteTarget?.user.id).toBe(userA.id);

    // ユーザー B に切り替えてから古い request A を resolve しても、状態は B のまま
    // Even if old request A resolves after switching to user B, the state stays on B.
    act(() => {
      result.current.requestDelete(userB);
    });
    expect(result.current.deleteTarget?.user.id).toBe(userB.id);

    await act(async () => {
      resolveA?.({ ...sampleImpact, notesCount: 999 });
      await Promise.resolve();
    });
    // A の結果は反映されない / A's resolved result must not be applied.
    expect(result.current.deleteTarget?.user.id).toBe(userB.id);
    expect(result.current.deleteTarget?.impact).toBeNull();
    expect(result.current.deleteTarget?.loadingImpact).toBe(true);

    // B の resolve はちゃんと反映される / B's resolve still propagates correctly.
    await act(async () => {
      resolveB?.(sampleImpact);
      await Promise.resolve();
    });
    expect(result.current.deleteTarget?.impact).toEqual(sampleImpact);
    expect(result.current.deleteTarget?.loadingImpact).toBe(false);
  });

  it("cancelDelete は requestId をインクリメントし、後から来た resolve を無効化する / cancelDelete bumps requestId and invalidates a late resolve", async () => {
    let resolveLate: ((v: UserImpact) => void) | null = null;
    vi.mocked(getUserImpact).mockImplementationOnce(
      () =>
        new Promise<UserImpact>((resolve) => {
          resolveLate = resolve;
        }),
    );

    const { result } = makeHook();
    act(() => {
      result.current.requestDelete(userA);
    });
    act(() => {
      result.current.cancelDelete();
    });
    expect(result.current.deleteTarget).toBeNull();

    // resolve しても deleteTarget は null のまま / late resolve does not revive deleteTarget.
    await act(async () => {
      resolveLate?.(sampleImpact);
      await Promise.resolve();
    });
    expect(result.current.deleteTarget).toBeNull();
  });

  it("confirmDelete で onDelete を呼んで target を null にする / confirmDelete fires onDelete and clears target", async () => {
    vi.mocked(getUserImpact).mockResolvedValueOnce(sampleImpact);
    const { result, onDelete } = makeHook();
    act(() => {
      result.current.requestDelete(userA);
    });
    await waitFor(() => {
      expect(result.current.deleteTarget?.loadingImpact).toBe(false);
    });

    act(() => {
      result.current.confirmDelete();
    });
    expect(onDelete).toHaveBeenCalledWith(userA);
    expect(result.current.deleteTarget).toBeNull();
  });

  it("confirmDelete が target なしのときは onDelete を呼ばない / confirmDelete without target does not fire onDelete", () => {
    const { result, onDelete } = makeHook();
    act(() => {
      result.current.confirmDelete();
    });
    expect(onDelete).not.toHaveBeenCalled();
  });
});
