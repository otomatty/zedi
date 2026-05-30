import { describe, it, expect, vi } from "vitest";
import { coalescePerKey } from "./coalescePerKey.js";

/** Promise を外部から解決できるようにする小さなヘルパー。 */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("coalescePerKey", () => {
  it("同一キーが in-flight の間は worker を多重起動しない", async () => {
    const gate = deferred();
    const worker = vi.fn(async (_key: string) => {
      await gate.promise;
    });
    const run = coalescePerKey(worker);

    // 1 回目: in-flight になる
    const first = run("page-1");
    // in-flight 中の追加呼び出しは新規 worker を起動しない
    run("page-1");
    run("page-1");

    expect(worker).toHaveBeenCalledTimes(1);

    // in-flight を解決すると、保留分をまとめて 1 回だけ追走させる
    gate.resolve();
    await first;
    // マイクロタスクを進めて trailing 実行を反映
    await Promise.resolve();
    await Promise.resolve();

    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("異なるキーは独立して並行実行される", async () => {
    const worker = vi.fn(async (_key: string) => {});
    const run = coalescePerKey(worker);

    await Promise.all([run("a"), run("b"), run("c")]);

    expect(worker).toHaveBeenCalledTimes(3);
    expect(worker).toHaveBeenCalledWith("a");
    expect(worker).toHaveBeenCalledWith("b");
    expect(worker).toHaveBeenCalledWith("c");
  });

  it("in-flight 中に追加要求が無ければ追走しない", async () => {
    const worker = vi.fn(async (_key: string) => {});
    const run = coalescePerKey(worker);

    await run("page-1");
    await run("page-1");

    // 連続だが各々 in-flight 期間に重ならないため、それぞれ 1 回ずつ
    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("worker が reject しても以降の実行を阻害しない", async () => {
    const worker = vi
      .fn<(key: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const run = coalescePerKey(worker);

    await run("page-1");
    await run("page-1");

    expect(worker).toHaveBeenCalledTimes(2);
  });

  it("trailing 実行は最新要求 1 件分のみに集約される", async () => {
    const gate = deferred();
    let calls = 0;
    const worker = vi.fn(async (_key: string) => {
      calls += 1;
      if (calls === 1) await gate.promise;
    });
    const run = coalescePerKey(worker);

    const first = run("page-1");
    // in-flight 中に 5 回要求しても trailing は 1 回に集約
    for (let i = 0; i < 5; i++) run("page-1");

    gate.resolve();
    await first;
    await Promise.resolve();
    await Promise.resolve();

    expect(worker).toHaveBeenCalledTimes(2);
  });
});
