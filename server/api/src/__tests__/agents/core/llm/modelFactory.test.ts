/**
 * `modelFactory` のテスト。`assertSupportedBackendP0` の挙動と `UnsupportedBackendError`
 * の型を固定する。`createZediChatModel` の DB / 環境変数まわりは統合テスト範囲
 * (route テスト) で見るため、ここは backend ガードに集中する。
 *
 * Tests for {@link assertSupportedBackendP0} and {@link UnsupportedBackendError}.
 * Full `createZediChatModel` is exercised through route tests (out of scope for
 * P0 unit tests); here we pin the backend whitelist so #951 cannot accidentally
 * widen it without a deliberate change.
 */
import { describe, expect, it } from "vitest";
import {
  assertSupportedBackendP0,
  UnsupportedBackendError,
} from "../../../../agents/core/llm/modelFactory.js";

describe("assertSupportedBackendP0", () => {
  it("accepts 'zedi_managed'", () => {
    expect(assertSupportedBackendP0("zedi_managed")).toBe("zedi_managed");
  });

  it.each(["byok", "byo_runner", "unknown", "", "ZEDI_MANAGED"])(
    "throws UnsupportedBackendError for %s",
    (backend) => {
      let caught: unknown;
      try {
        assertSupportedBackendP0(backend);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UnsupportedBackendError);
      expect((caught as UnsupportedBackendError).backend).toBe(backend);
      expect((caught as UnsupportedBackendError).code).toBe("UNSUPPORTED_BACKEND");
    },
  );
});
