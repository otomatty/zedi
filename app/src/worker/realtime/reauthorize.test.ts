import { describe, expect, it } from "vitest";
import type { NoteRole } from "../../shared/types";
import { REAUTHORIZE_INTERVAL_MS, planReauthorization } from "./reauthorize";

/** Connection decisions after refreshing note roles. / ノートの権限を再確認した後の接続の扱い。 */
describe("planReauthorization", () => {
  it("uses a 30 second refresh interval", () => {
    expect(REAUTHORIZE_INTERVAL_MS).toBe(30_000);
  });

  it("closes connections without access or a user ID in connection order", () => {
    const connections = [
      { id: "revoked", userId: "removed", readOnly: true },
      { id: "keep", userId: "owner", readOnly: false },
      { id: "legacy", userId: null, readOnly: false },
    ];
    const roles = new Map<string, NoteRole>([["owner", "owner"]]);
    expect(planReauthorization(connections, roles)).toEqual({
      close: ["revoked", "legacy"],
      setReadOnly: [],
    });
  });

  it("changes only stale permissions and applies the same role to each of a user's connections", () => {
    const connections = [
      { id: "downgraded-tab-2", userId: "downgraded", readOnly: false },
      { id: "upgraded", userId: "upgraded", readOnly: true },
      { id: "unchanged-viewer", userId: "viewer", readOnly: true },
      { id: "downgraded-tab-1", userId: "downgraded", readOnly: false },
      { id: "unchanged-editor", userId: "upgraded", readOnly: false },
      { id: "owner", userId: "owner", readOnly: true },
    ];
    const roles = new Map<string, NoteRole>([
      ["owner", "owner"],
      ["viewer", "viewer"],
      ["upgraded", "editor"],
      ["downgraded", "viewer"],
    ]);
    expect(planReauthorization(connections, roles)).toEqual({
      close: [],
      setReadOnly: [
        { id: "downgraded-tab-2", readOnly: true },
        { id: "upgraded", readOnly: false },
        { id: "downgraded-tab-1", readOnly: true },
        { id: "owner", readOnly: false },
      ],
    });
  });

  it("does nothing when there are no connections", () => {
    expect(planReauthorization([], new Map([["owner", "owner"]]))).toEqual({
      close: [],
      setReadOnly: [],
    });
  });
});
