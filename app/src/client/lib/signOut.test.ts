import { describe, expect, it, vi } from "vitest";
import { signOut } from "./signOut";

function deps(endServerSession: () => Promise<{ error?: unknown } | undefined>) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      endServerSession: vi.fn(async () => {
        calls.push("server");
        return endServerSession();
      }),
      clearOfflineData: vi.fn(async () => void calls.push("offline")),
      clearQueries: vi.fn(() => void calls.push("queries")),
      endLocalSession: vi.fn(() => void calls.push("local")),
    },
  };
}

describe("signOut", () => {
  it("ends the server session first, then clears what this device keeps", async () => {
    const { calls, deps: d } = deps(async () => ({}));

    await expect(signOut(d)).resolves.toBe(true);

    expect(calls).toEqual(["server", "offline", "queries", "local"]);
  });

  it("keeps the user signed in when the server refuses the sign-out", async () => {
    // Better Auth は失敗を例外ではなく `{ error }` で返す。Cookie が有効なまま画面だけ
    // サインアウトすると、再読み込みでセッションが戻ってしまう。
    // Better Auth reports failure as `{ error }`, not an exception. Showing signed-out while the
    // cookie is still valid would bring the session back on reload.
    const { calls, deps: d } = deps(async () => ({ error: { status: 500 } }));

    await expect(signOut(d)).resolves.toBe(false);

    expect(calls).toEqual(["server"]);
  });

  it("keeps the user signed in when the request or the client chunk fails", async () => {
    const { calls, deps: d } = deps(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(signOut(d)).resolves.toBe(false);

    expect(calls).toEqual(["server"]);
  });
});
