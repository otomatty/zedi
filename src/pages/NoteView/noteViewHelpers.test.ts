/**
 * getNoteViewPermissions: derive note view flags from access and note source (local vs remote).
 * アクセス権とノートソースからノートビュー用の権限フラグを算出する。
 */
import { describe, it, expect } from "vitest";
import { getNoteViewPermissions } from "./noteViewHelpers";

describe("getNoteViewPermissions", () => {
  describe("canEdit", () => {
    it("returns true only when access.canEdit and noteSource is local", () => {
      expect(getNoteViewPermissions({ canEdit: true }, "local").canEdit).toBe(true);
      expect(getNoteViewPermissions({ canEdit: true }, "remote").canEdit).toBe(false);
      expect(getNoteViewPermissions({ canEdit: false }, "local").canEdit).toBe(false);
      expect(getNoteViewPermissions(undefined, "local").canEdit).toBe(false);
    });
  });

  describe("canAddPage", () => {
    it("returns true when access.canAddPage is true regardless of noteSource", () => {
      expect(getNoteViewPermissions({ canAddPage: true }, "local").canAddPage).toBe(true);
      expect(getNoteViewPermissions({ canAddPage: true }, "remote").canAddPage).toBe(true);
      expect(getNoteViewPermissions({ canAddPage: false }, "local").canAddPage).toBe(false);
      expect(getNoteViewPermissions(undefined, "local").canAddPage).toBe(false);
    });
  });

  describe("canShowAddPage", () => {
    it("returns true when canEdit OR canAddPage (either permits showing add-page UI)", () => {
      expect(
        getNoteViewPermissions({ canEdit: true, canAddPage: false }, "local").canShowAddPage,
      ).toBe(true);
      expect(
        getNoteViewPermissions({ canEdit: false, canAddPage: true }, "local").canShowAddPage,
      ).toBe(true);
      expect(
        getNoteViewPermissions({ canEdit: true, canAddPage: true }, "local").canShowAddPage,
      ).toBe(true);
      expect(
        getNoteViewPermissions({ canEdit: false, canAddPage: false }, "local").canShowAddPage,
      ).toBe(false);
      expect(getNoteViewPermissions({ canAddPage: true }, "remote").canShowAddPage).toBe(true);
    });
  });

  describe("canView", () => {
    it("returns true when access.canView is true regardless of noteSource", () => {
      expect(getNoteViewPermissions({ canView: true }, "local").canView).toBe(true);
      expect(getNoteViewPermissions({ canView: true }, "remote").canView).toBe(true);
      expect(getNoteViewPermissions({ canView: false }, "local").canView).toBe(false);
      expect(getNoteViewPermissions(undefined, "local").canView).toBe(false);
    });
  });

  describe("canManageMembers", () => {
    it("returns true only when access.canManageMembers and noteSource is local", () => {
      expect(getNoteViewPermissions({ canManageMembers: true }, "local").canManageMembers).toBe(
        true,
      );
      expect(getNoteViewPermissions({ canManageMembers: true }, "remote").canManageMembers).toBe(
        false,
      );
      expect(getNoteViewPermissions({ canManageMembers: false }, "local").canManageMembers).toBe(
        false,
      );
      expect(getNoteViewPermissions(undefined, "local").canManageMembers).toBe(false);
    });
  });
});
