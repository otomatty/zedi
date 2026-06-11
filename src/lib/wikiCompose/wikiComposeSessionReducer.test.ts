/**
 * Tests for the instant-mode / Understanding-Layer additions to the Wiki
 * Compose reducer.
 *
 * - `compose_completion` SSE → final article + comprehension aids (instant mode
 *   delivers everything in one stream, with no outline gate).
 * - `compose_section` started → live outline entry so tokens render in place.
 * - `coerceComprehensionAids` validation.
 * - resume output (guided mode) carries comprehension aids.
 */
import { describe, expect, it } from "vitest";
import {
  INITIAL_WIKI_COMPOSE_SESSION_STATE,
  coerceComprehensionAids,
  reduceComposeResumeOutput,
  reduceComposeSseEvent,
  type WikiComposeSessionState,
} from "./wikiComposeSessionReducer";
import type { ComposeSseEvent } from "./types";

const base: WikiComposeSessionState = INITIAL_WIKI_COMPOSE_SESSION_STATE;

describe("coerceComprehensionAids", () => {
  it("parses a well-formed aids object", () => {
    const aids = coerceComprehensionAids({
      summary: "TL;DR",
      keyTerms: [{ term: "T", definition: "D" }],
      questions: ["Q1", "Q2"],
    });
    expect(aids).toEqual({
      summary: "TL;DR",
      keyTerms: [{ term: "T", definition: "D" }],
      questions: ["Q1", "Q2"],
    });
  });

  it("drops malformed key terms and non-string questions", () => {
    const aids = coerceComprehensionAids({
      summary: "S",
      keyTerms: [{ term: "ok", definition: "d" }, { term: 1 }, null],
      questions: ["good", 42, null],
    });
    expect(aids).toEqual({
      summary: "S",
      keyTerms: [{ term: "ok", definition: "d" }],
      questions: ["good"],
    });
  });

  it("returns null when everything is empty/invalid", () => {
    expect(coerceComprehensionAids(null)).toBeNull();
    expect(coerceComprehensionAids({ summary: "", keyTerms: [], questions: [] })).toBeNull();
  });
});

describe("reduceComposeSseEvent — instant mode", () => {
  it("compose_section started adds a live outline entry and resets the buffer", () => {
    const event: ComposeSseEvent = {
      type: "compose_section",
      sectionId: "sec-1",
      heading: "Overview",
      status: "started",
      index: 1,
      total: 1,
    };
    const patch = reduceComposeSseEvent(base, event);
    expect(patch.streamingSectionId).toBe("sec-1");
    expect(patch.outlineProposal).toEqual([
      { id: "sec-1", heading: "Overview", depth: 1, intent: "" },
    ]);
    expect(patch.sectionBuffers).toEqual({ "sec-1": "" });
  });

  it("compose_section started does not duplicate an existing outline entry", () => {
    const prev: WikiComposeSessionState = {
      ...base,
      outlineProposal: [{ id: "sec-1", heading: "Overview", depth: 1, intent: "x" }],
    };
    const patch = reduceComposeSseEvent(prev, {
      type: "compose_section",
      sectionId: "sec-1",
      heading: "Overview",
      status: "started",
      index: 1,
      total: 1,
    });
    expect(patch.outlineProposal).toHaveLength(1);
  });

  it("token appends into the streaming section buffer", () => {
    const prev: WikiComposeSessionState = {
      ...base,
      streamingSectionId: "sec-1",
      sectionBuffers: { "sec-1": "Hello " },
    };
    const patch = reduceComposeSseEvent(prev, { type: "token", content: "world" });
    expect(patch.sectionBuffers).toEqual({ "sec-1": "Hello world" });
  });

  it("compose_completion sets markdown, drafted sections, outline fallback and aids", () => {
    const event: ComposeSseEvent = {
      type: "compose_completion",
      completion: {
        markdown: "## Overview\n\nBody.",
        sections: [
          {
            sectionId: "sec-1",
            heading: "Overview",
            body: "Body.",
            citedSourceIds: [],
            completedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        comprehensionAids: {
          summary: "TL;DR",
          keyTerms: [{ term: "T", definition: "D" }],
          questions: ["Q?"],
        },
      },
    };
    const patch = reduceComposeSseEvent(base, event);
    expect(patch.phase).toBe("completed");
    expect(patch.completedMarkdown).toMatch(/Overview/);
    expect(patch.draftedSections?.["sec-1"]?.body).toBe("Body.");
    expect(patch.outlineProposal).toEqual([
      { id: "sec-1", heading: "Overview", depth: 1, intent: "" },
    ]);
    expect(patch.comprehensionAids?.summary).toBe("TL;DR");
    expect(patch.comprehensionAids?.questions).toEqual(["Q?"]);
  });

  it("compose_completion preserves an existing outline instead of overwriting", () => {
    const prev: WikiComposeSessionState = {
      ...base,
      outlineProposal: [{ id: "sec-1", heading: "Custom", depth: 1, intent: "kept" }],
    };
    const patch = reduceComposeSseEvent(prev, {
      type: "compose_completion",
      completion: {
        markdown: "x",
        sections: [
          {
            sectionId: "sec-1",
            heading: "Overview",
            body: "B",
            citedSourceIds: [],
            completedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    // Existing outline (with the user's intent text) is not replaced.
    expect(patch.outlineProposal).toBeUndefined();
  });
});

describe("reduceComposeResumeOutput — guided mode aids", () => {
  it("extracts comprehension aids from the completion in a resume response", () => {
    const patch = reduceComposeResumeOutput(
      {
        completion: {
          markdown: "## A\n\nB",
          sections: [
            {
              sectionId: "sec-1",
              heading: "A",
              body: "B",
              citedSourceIds: [],
              completedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          comprehensionAids: { summary: "S", keyTerms: [], questions: ["Q?"] },
        },
      },
      "completed",
    );
    expect(patch.phase).toBe("completed");
    expect(patch.comprehensionAids?.summary).toBe("S");
    expect(patch.comprehensionAids?.questions).toEqual(["Q?"]);
  });
});
