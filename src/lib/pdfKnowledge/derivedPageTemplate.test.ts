import { describe, expect, it } from "vitest";
import {
  buildDerivedPageTemplate,
  buildDerivedPageTitle,
  buildPdfSourceDeepLink,
} from "./derivedPageTemplate";

describe("buildPdfSourceDeepLink", () => {
  it("encodes the source id and page number as a viewer route with a #page= fragment", () => {
    expect(
      buildPdfSourceDeepLink({
        sourceId: "0d6c5d20-7e9b-4a3f-9d63-7f4b2c11ab90",
        pdfPage: 12,
      }),
    ).toBe("/sources/0d6c5d20-7e9b-4a3f-9d63-7f4b2c11ab90/pdf#page=12");
  });

  it("URI-encodes a non-canonical source id (defense-in-depth)", () => {
    expect(buildPdfSourceDeepLink({ sourceId: "a/b c", pdfPage: 1 })).toBe(
      "/sources/a%2Fb%20c/pdf#page=1",
    );
  });

  it("throws on non-1-indexed-integer pdfPage so invalid deep links never propagate", () => {
    expect(() => buildPdfSourceDeepLink({ sourceId: "s", pdfPage: 0 })).toThrow();
    expect(() => buildPdfSourceDeepLink({ sourceId: "s", pdfPage: -1 })).toThrow();
    expect(() => buildPdfSourceDeepLink({ sourceId: "s", pdfPage: 1.5 })).toThrow();
    expect(() => buildPdfSourceDeepLink({ sourceId: "s", pdfPage: Number.NaN })).toThrow();
  });
});

describe("buildDerivedPageTitle", () => {
  it("uses a short prefix of the highlight text when present", () => {
    const title = buildDerivedPageTitle({ highlightText: "The cost of context switching is real" });
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title).toContain("The cost of context switching");
  });

  it("falls back to the display name when highlight text is empty", () => {
    expect(buildDerivedPageTitle({ highlightText: "", displayName: "Deep Work.pdf" })).toBe(
      "Deep Work.pdf",
    );
  });

  it("falls back to a generic label when nothing is known", () => {
    expect(buildDerivedPageTitle({ highlightText: "" })).toBe("Untitled PDF excerpt");
  });

  it("collapses whitespace and strips trailing punctuation introduced by selection edges", () => {
    expect(buildDerivedPageTitle({ highlightText: "  hello\n  world.  " })).toBe("hello world");
  });
});

describe("buildDerivedPageTemplate", () => {
  const highlight = {
    sourceId: "0d6c5d20-7e9b-4a3f-9d63-7f4b2c11ab90",
    pdfPage: 12,
    text: "Reading does not equal understanding",
    displayName: "Deep Work.pdf",
  };

  it("returns a Tiptap doc as a stringified JSON document", () => {
    const tiptapJson = buildDerivedPageTemplate(highlight);
    const parsed = JSON.parse(tiptapJson);
    expect(parsed.type).toBe("doc");
    expect(Array.isArray(parsed.content)).toBe(true);
  });

  it("starts with a blockquote of the highlight text — the immutable raw material", () => {
    const parsed = JSON.parse(buildDerivedPageTemplate(highlight));
    const first = parsed.content[0];
    expect(first.type).toBe("blockquote");
    // blockquote > paragraph > text
    const textNode = first.content?.[0]?.content?.[0];
    expect(textNode?.type).toBe("text");
    expect(textNode?.text).toContain("Reading does not equal understanding");
  });

  it("includes a citation line linking back to the PDF source at the right page", () => {
    const parsed = JSON.parse(buildDerivedPageTemplate(highlight));
    // Walk every node and find at least one link mark to the deep link.
    const expectedHref = "/sources/0d6c5d20-7e9b-4a3f-9d63-7f4b2c11ab90/pdf#page=12";
    let foundLink = false;
    const visit = (node: { content?: unknown[]; marks?: unknown[] }) => {
      const marks = (node.marks ?? []) as Array<{ type?: string; attrs?: { href?: string } }>;
      for (const m of marks) {
        if (m.type === "link" && m.attrs?.href === expectedHref) {
          foundLink = true;
        }
      }
      for (const child of (node.content ?? []) as Array<{
        content?: unknown[];
        marks?: unknown[];
      }>) {
        visit(child);
      }
    };
    visit(parsed);
    expect(foundLink).toBe(true);
  });

  it("ends with an empty paragraph so the cursor lands on a writable line", () => {
    const parsed = JSON.parse(buildDerivedPageTemplate(highlight));
    const last = parsed.content[parsed.content.length - 1];
    expect(last.type).toBe("paragraph");
    expect(last.content).toBeUndefined();
  });

  it("is deterministic for the same inputs (snapshot-friendly)", () => {
    const a = buildDerivedPageTemplate(highlight);
    const b = buildDerivedPageTemplate(highlight);
    expect(a).toBe(b);
  });
});
