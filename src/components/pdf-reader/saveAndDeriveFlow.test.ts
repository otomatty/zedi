/**
 * Tests for {@link runSaveAndDeriveFlow}.
 *
 * The flow is the user-visible behaviour of `[保存して新規ページ]`: create a
 * highlight, derive a Zedi page, and navigate to it. The two branches we
 * verify explicitly are (a) the seed path (templateContent → navigate with
 * `state.initialContent`) and (b) the `alreadyDerived` path (no seed).
 */
import { describe, expect, it, vi } from "vitest";
import { runSaveAndDeriveFlow } from "./saveAndDeriveFlow";
import type { PdfHighlight } from "@/lib/pdfKnowledge/highlightsApi";

function makeHighlight(overrides: Partial<PdfHighlight> = {}): PdfHighlight {
  return {
    id: "h-1",
    sourceId: "src-1",
    ownerId: "u-1",
    derivedPageId: null,
    derivedPageNoteId: null,
    pdfPage: 2,
    rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
    text: "Long enough body text for the citation.",
    color: "yellow",
    note: null,
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
    ...overrides,
  };
}

describe("runSaveAndDeriveFlow", () => {
  it("creates highlight, derives page, and navigates with state.initialContent", async () => {
    const navigate = vi.fn();
    const createHighlight = vi.fn().mockResolvedValue({ highlight: makeHighlight() });
    const derivePage = vi.fn().mockResolvedValue({
      pageId: "page-99",
      noteId: "note-99",
      templateContent: '{"type":"doc","content":[]}',
    });

    const result = await runSaveAndDeriveFlow({
      sourceId: "src-1",
      createBody: {
        pdfPage: 2,
        rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
        text: "Long enough body text for the citation.",
        color: "yellow",
      },
      displayName: "paper.pdf",
      createHighlight,
      derivePage,
      navigate,
    });

    expect(createHighlight).toHaveBeenCalledTimes(1);
    expect(derivePage).toHaveBeenCalledTimes(1);
    const derivePayload = derivePage.mock.calls[0][0] as {
      highlightId: string;
      body: { title: string; contentPreview: string; templateContent: string };
    };
    expect(derivePayload.highlightId).toBe("h-1");
    expect(derivePayload.body.title.length).toBeGreaterThan(0);
    expect(derivePayload.body.contentPreview.length).toBeGreaterThan(0);
    // templateContent must be valid JSON containing the blockquote.
    const parsed = JSON.parse(derivePayload.body.templateContent) as {
      type: string;
      content: { type: string }[];
    };
    expect(parsed.type).toBe("doc");
    expect(parsed.content.some((n) => n.type === "blockquote")).toBe(true);

    expect(navigate).toHaveBeenCalledWith("/notes/note-99/page-99", {
      state: { initialContent: '{"type":"doc","content":[]}' },
    });
    expect(result).toEqual({ status: "ok", pageId: "page-99" });
  });

  it("falls back to locally-built templateContent if the server omits it", async () => {
    const navigate = vi.fn();
    const createHighlight = vi.fn().mockResolvedValue({ highlight: makeHighlight() });
    const derivePage = vi.fn().mockResolvedValue({
      pageId: "page-42",
      noteId: "note-42",
      // No `templateContent` on the response — older server or proxy.
    });

    await runSaveAndDeriveFlow({
      sourceId: "src-1",
      createBody: {
        pdfPage: 2,
        rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
        text: "Long enough body text for the citation.",
      },
      createHighlight,
      derivePage,
      navigate,
    });

    const call = navigate.mock.calls[0];
    expect(call[0]).toBe("/notes/note-42/page-42");
    const state = (call[1] as { state: { initialContent: string } }).state;
    // The fallback uses the locally-built templateContent (same shape).
    expect(JSON.parse(state.initialContent).type).toBe("doc");
  });

  it("navigates without state when the server reports alreadyDerived: true", async () => {
    const navigate = vi.fn();
    const createHighlight = vi.fn().mockResolvedValue({
      highlight: makeHighlight({
        id: "existing-h",
        derivedPageId: "page-existing",
        derivedPageNoteId: "note-existing",
      }),
    });
    const derivePage = vi.fn().mockResolvedValue({
      pageId: "page-existing",
      noteId: "note-existing",
      alreadyDerived: true,
    });

    const result = await runSaveAndDeriveFlow({
      sourceId: "src-1",
      createBody: {
        pdfPage: 2,
        rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
        text: "Long enough body text for the citation.",
      },
      createHighlight,
      derivePage,
      navigate,
    });

    expect(navigate).toHaveBeenCalledWith("/notes/note-existing/page-existing");
    expect(navigate.mock.calls[0][1]).toBeUndefined();
    expect(result).toEqual({ status: "alreadyDerived", pageId: "page-existing" });
  });

  it("returns an error result when createHighlight throws", async () => {
    const navigate = vi.fn();
    const createHighlight = vi.fn().mockRejectedValue(new Error("server boom"));
    const derivePage = vi.fn();

    const result = await runSaveAndDeriveFlow({
      sourceId: "src-1",
      createBody: {
        pdfPage: 1,
        rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
        text: "x",
      },
      createHighlight,
      derivePage,
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(derivePage).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.message).toBe("server boom");
    }
  });

  it("returns an error result when derivePage throws", async () => {
    const navigate = vi.fn();
    const createHighlight = vi.fn().mockResolvedValue({ highlight: makeHighlight() });
    const derivePage = vi.fn().mockRejectedValue(new Error("derive failed"));

    const result = await runSaveAndDeriveFlow({
      sourceId: "src-1",
      createBody: {
        pdfPage: 1,
        rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
        text: "x",
      },
      createHighlight,
      derivePage,
      navigate,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });
});
