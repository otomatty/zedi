import { beforeEach, describe, expect, it } from "vitest";
import {
  clearNoteWorkspacePath,
  readNoteWorkspacePath,
  writeNoteWorkspacePath,
} from "./noteWorkspaceStore";

describe("noteWorkspaceStore", () => {
  beforeEach(() => {
    localStorage.removeItem("zedi.noteWorkspace.v1");
  });

  it("reads and writes path per note", () => {
    expect(readNoteWorkspacePath("n1")).toBe(null);
    writeNoteWorkspacePath("n1", "/tmp/proj");
    expect(readNoteWorkspacePath("n1")).toBe("/tmp/proj");
    clearNoteWorkspacePath("n1");
    expect(readNoteWorkspacePath("n1")).toBe(null);
  });
});
