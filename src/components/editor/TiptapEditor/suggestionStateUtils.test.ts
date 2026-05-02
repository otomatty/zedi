import { describe, it, expect } from "vitest";
import {
  isSameSuggestionRange,
  isSameWikiLinkSuggestionState,
  isSameSlashSuggestionState,
  isSameTagSuggestionState,
} from "./suggestionStateUtils";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";

function createWikiLinkState(overrides: Partial<WikiLinkSuggestionState>): WikiLinkSuggestionState {
  return {
    active: false,
    query: "",
    range: null,
    decorations: {} as WikiLinkSuggestionState["decorations"],
    ...overrides,
  };
}

function createSlashState(overrides: Partial<SlashSuggestionState>): SlashSuggestionState {
  return {
    active: false,
    query: "",
    range: null,
    decorations: {} as SlashSuggestionState["decorations"],
    ...overrides,
  };
}

function createTagState(overrides: Partial<TagSuggestionState>): TagSuggestionState {
  return {
    active: false,
    query: "",
    range: null,
    decorations: {} as TagSuggestionState["decorations"],
    ...overrides,
  };
}

describe("isSameSuggestionRange", () => {
  it("returns true when both are null", () => {
    expect(isSameSuggestionRange(null, null)).toBe(true);
  });

  it("returns false when one is null and the other is not", () => {
    expect(isSameSuggestionRange(null, { from: 0, to: 1 })).toBe(false);
    expect(isSameSuggestionRange({ from: 0, to: 1 }, null)).toBe(false);
  });

  it("returns true when both ranges have same from and to", () => {
    expect(isSameSuggestionRange({ from: 0, to: 5 }, { from: 0, to: 5 })).toBe(true);
  });

  it("returns false when from differs", () => {
    expect(isSameSuggestionRange({ from: 0, to: 5 }, { from: 1, to: 5 })).toBe(false);
  });

  it("returns false when to differs", () => {
    expect(isSameSuggestionRange({ from: 0, to: 5 }, { from: 0, to: 6 })).toBe(false);
  });
});

describe("isSameWikiLinkSuggestionState", () => {
  it("returns false when first argument is null", () => {
    const b = createWikiLinkState({ active: true, query: "foo", range: { from: 0, to: 3 } });
    expect(isSameWikiLinkSuggestionState(null, b)).toBe(false);
  });

  it("returns true when active, query and range match", () => {
    const state = createWikiLinkState({
      active: true,
      query: "foo",
      range: { from: 0, to: 3 },
    });
    expect(isSameWikiLinkSuggestionState(state, state)).toBe(true);
    const b = createWikiLinkState({ active: true, query: "foo", range: { from: 0, to: 3 } });
    expect(isSameWikiLinkSuggestionState(state, b)).toBe(true);
  });

  it("returns false when active differs", () => {
    const a = createWikiLinkState({ active: true, query: "q", range: null });
    const b = createWikiLinkState({ active: false, query: "q", range: null });
    expect(isSameWikiLinkSuggestionState(a, b)).toBe(false);
  });

  it("returns false when query differs", () => {
    const a = createWikiLinkState({ active: true, query: "a", range: null });
    const b = createWikiLinkState({ active: true, query: "b", range: null });
    expect(isSameWikiLinkSuggestionState(a, b)).toBe(false);
  });

  it("returns false when range differs", () => {
    const a = createWikiLinkState({ active: true, query: "q", range: { from: 0, to: 1 } });
    const b = createWikiLinkState({ active: true, query: "q", range: { from: 0, to: 2 } });
    expect(isSameWikiLinkSuggestionState(a, b)).toBe(false);
  });
});

describe("isSameSlashSuggestionState", () => {
  it("returns false when first argument is null", () => {
    const b = createSlashState({ active: true, query: "foo", range: { from: 0, to: 3 } });
    expect(isSameSlashSuggestionState(null, b)).toBe(false);
  });

  it("returns true when active, query and range match", () => {
    const state = createSlashState({
      active: true,
      query: "img",
      range: { from: 1, to: 4 },
    });
    expect(isSameSlashSuggestionState(state, state)).toBe(true);
    const b = createSlashState({ active: true, query: "img", range: { from: 1, to: 4 } });
    expect(isSameSlashSuggestionState(state, b)).toBe(true);
  });

  it("returns false when active differs", () => {
    const a = createSlashState({ active: true, query: "q", range: null });
    const b = createSlashState({ active: false, query: "q", range: null });
    expect(isSameSlashSuggestionState(a, b)).toBe(false);
  });

  it("returns false when query differs", () => {
    const a = createSlashState({ active: true, query: "a", range: null });
    const b = createSlashState({ active: true, query: "b", range: null });
    expect(isSameSlashSuggestionState(a, b)).toBe(false);
  });

  it("returns false when range differs", () => {
    const a = createSlashState({ active: true, query: "q", range: { from: 0, to: 1 } });
    const b = createSlashState({ active: true, query: "q", range: { from: 2, to: 3 } });
    expect(isSameSlashSuggestionState(a, b)).toBe(false);
  });
});

describe("isSameTagSuggestionState", () => {
  it("returns false when first argument is null", () => {
    const b = createTagState({ active: true, query: "tec", range: { from: 0, to: 4 } });
    expect(isSameTagSuggestionState(null, b)).toBe(false);
  });

  it("returns true when active, query and range match", () => {
    const state = createTagState({ active: true, query: "tec", range: { from: 1, to: 5 } });
    expect(isSameTagSuggestionState(state, state)).toBe(true);
    const b = createTagState({ active: true, query: "tec", range: { from: 1, to: 5 } });
    expect(isSameTagSuggestionState(state, b)).toBe(true);
  });

  it("returns false when active differs", () => {
    const a = createTagState({ active: true, query: "q", range: null });
    const b = createTagState({ active: false, query: "q", range: null });
    expect(isSameTagSuggestionState(a, b)).toBe(false);
  });

  it("returns false when query differs", () => {
    const a = createTagState({ active: true, query: "a", range: null });
    const b = createTagState({ active: true, query: "b", range: null });
    expect(isSameTagSuggestionState(a, b)).toBe(false);
  });

  it("returns false when range differs", () => {
    const a = createTagState({ active: true, query: "q", range: { from: 0, to: 1 } });
    const b = createTagState({ active: true, query: "q", range: { from: 2, to: 3 } });
    expect(isSameTagSuggestionState(a, b)).toBe(false);
  });
});
