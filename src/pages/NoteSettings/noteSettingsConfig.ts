import type { NoteEditPermission, NoteVisibility } from "@/types/note";

export /**
 *
 */
const visibilityKeys: Record<NoteVisibility, string> = {
  private: "notes.visibilityPrivate",
  public: "notes.visibilityPublic",
  unlisted: "notes.visibilityUnlisted",
  restricted: "notes.visibilityRestricted",
};

export /**
 *
 */
const editPermissionKeys: Record<NoteEditPermission, string> = {
  owner_only: "notes.editPermissionOwnerOnly",
  members_editors: "notes.editPermissionMembersEditors",
  any_logged_in: "notes.editPermissionAnyLoggedIn",
};

export /**
 *
 */
const allowedEditPermissions: Record<NoteVisibility, NoteEditPermission[]> = {
  private: ["owner_only"],
  restricted: ["owner_only", "members_editors"],
  unlisted: ["owner_only", "members_editors", "any_logged_in"],
  public: ["owner_only", "members_editors", "any_logged_in"],
};
