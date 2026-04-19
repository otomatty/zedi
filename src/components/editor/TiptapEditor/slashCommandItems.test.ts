/**
 * slashCommandItems: filtering and platform-gated availability.
 * slashCommandItems: フィルタリングとプラットフォーム依存の可用性判定。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Editor } from "@tiptap/core";
import { slashCommandItems, filterSlashCommandItems } from "./slashCommandItems";

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => true),
}));

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

/**
 * 全 Tiptap 拡張が登録されている想定のスタブエディタを返す。
 * Returns a stub editor that pretends every Tiptap extension is registered.
 */
function makeEditorWithAllExtensions(): Editor {
  const extensions = [
    { name: "taskList" },
    { name: "executableCodeBlock" },
    { name: "table" },
    { name: "mermaid" },
    { name: "mathematics" },
    { name: "htmlArtifact" },
    { name: "mcpResource" },
  ];
  return {
    extensionManager: { extensions },
  } as unknown as Editor;
}

const tFunction = (key: string) => key;

describe("slashCommandItems platform gating", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);
  });

  it("includes executableCodeBlock and mcpResource on desktop", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);

    const editor = makeEditorWithAllExtensions();
    const filtered = filterSlashCommandItems(slashCommandItems, "", editor, tFunction);
    const ids = filtered.map((i) => i.id);

    expect(ids).toContain("executableCodeBlock");
    expect(ids).toContain("mcpResource");
  });

  it("hides executableCodeBlock and mcpResource on web (non-Tauri)", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);

    const editor = makeEditorWithAllExtensions();
    const filtered = filterSlashCommandItems(slashCommandItems, "", editor, tFunction);
    const ids = filtered.map((i) => i.id);

    expect(ids).not.toContain("executableCodeBlock");
    expect(ids).not.toContain("mcpResource");
  });

  it("still includes platform-agnostic items on web", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);

    const editor = makeEditorWithAllExtensions();
    const filtered = filterSlashCommandItems(slashCommandItems, "", editor, tFunction);
    const ids = filtered.map((i) => i.id);

    expect(ids).toContain("paragraph");
    expect(ids).toContain("heading1");
    expect(ids).toContain("table");
    expect(ids).toContain("mermaid");
  });
});
