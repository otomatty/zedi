import { describe, it, expect, vi } from "vitest";
import { COMPOSE_SEED_STATE_KEY, navigateToWikiCompose, wikiComposePath } from "./navigation";

describe("wikiCompose navigation", () => {
  it("wikiComposePath builds the compose route", () => {
    expect(wikiComposePath("note-1", "page-1")).toBe("/notes/note-1/page-1/compose");
  });

  it("navigateToWikiCompose forwards optional seed on location state", () => {
    const navigate = vi.fn();
    navigateToWikiCompose({
      navigate,
      noteId: "note-1",
      pageId: "page-1",
      seed: { outline: "- a", conversationText: "User: hi" },
    });
    expect(navigate).toHaveBeenCalledWith("/notes/note-1/page-1/compose", {
      state: {
        [COMPOSE_SEED_STATE_KEY]: { outline: "- a", conversationText: "User: hi" },
      },
    });
  });

  it("navigateToWikiCompose omits state when seed is absent", () => {
    const navigate = vi.fn();
    navigateToWikiCompose({ navigate, noteId: "n", pageId: "p" });
    expect(navigate).toHaveBeenCalledWith("/notes/n/p/compose", { state: undefined });
  });
});
