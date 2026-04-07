import { describe, it, expect } from "vitest";
import { wrapArtifactHtml } from "./wrapHtml";

describe("wrapArtifactHtml", () => {
  it("should wrap a simple HTML fragment into a full document", () => {
    const html = "<p>Hello</p>";
    const result = wrapArtifactHtml(html);

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("<head>");
    expect(result).toContain("<body>");
    expect(result).toContain("<p>Hello</p>");
  });

  it("should include Claude CSS variable defaults in :root", () => {
    const result = wrapArtifactHtml("<div>test</div>");

    expect(result).toContain("--color-text-secondary");
    expect(result).toContain("--color-border-tertiary");
    expect(result).toContain("--border-radius-md");
    expect(result).toContain("--font-mono");
  });

  it("should include dark mode media query", () => {
    const result = wrapArtifactHtml("<div>test</div>");

    expect(result).toContain("prefers-color-scheme: dark");
  });

  it("should include resize observer script for iframe height auto-adjustment", () => {
    const result = wrapArtifactHtml("<div>test</div>");

    expect(result).toContain("ResizeObserver");
    expect(result).toContain("zedi-artifact-resize");
    expect(result).toContain("parent.postMessage");
  });

  it("should set charset to utf-8", () => {
    const result = wrapArtifactHtml("<div>test</div>");

    expect(result).toContain('charset="utf-8"');
  });

  it("should preserve SVG content", () => {
    const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    const result = wrapArtifactHtml(svg);

    expect(result).toContain(svg);
  });

  it("should preserve script tags from the fragment", () => {
    const html =
      '<div id="app"></div><script>document.getElementById("app").textContent="OK";</script>';
    const result = wrapArtifactHtml(html);

    expect(result).toContain('<script>document.getElementById("app").textContent="OK";</script>');
  });

  it("should preserve style tags from the fragment", () => {
    const html = "<style>.foo { color: red; }</style><div class='foo'>red text</div>";
    const result = wrapArtifactHtml(html);

    expect(result).toContain("<style>.foo { color: red; }</style>");
  });

  it("should preserve canvas elements", () => {
    const html = '<canvas id="cv"></canvas>';
    const result = wrapArtifactHtml(html);

    expect(result).toContain('<canvas id="cv"></canvas>');
  });

  it("should include SVG class definitions for Claude diagram styling", () => {
    const result = wrapArtifactHtml("<svg></svg>");

    expect(result).toContain(".c-blue");
    expect(result).toContain(".c-coral");
    expect(result).toContain(".c-teal");
  });

  it("should handle empty input", () => {
    const result = wrapArtifactHtml("");

    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<body>");
  });
});
