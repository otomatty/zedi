// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMarkdownStream } from "./markdownStream";

function manualFrames() {
  const queue: (() => void)[] = [];
  return {
    schedule: (cb: () => void) => queue.push(cb),
    cancel: vi.fn(),
    run: () => queue.splice(0).forEach((cb) => cb()),
  };
}

describe("createMarkdownStream", () => {
  it("renders completed blocks once and keeps re-rendering only the open tail", () => {
    const frames = manualFrames();
    const container = document.createElement("div");
    const stream = createMarkdownStream(container, frames.schedule, frames.cancel);

    stream.append("# Title\n\nfirst para");
    frames.run();
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Title");
    expect(container.querySelector("p")?.textContent).toBe("first para");

    stream.append("graph continues\n\n- item");
    frames.run();
    expect(container.querySelector("h1")).toBe(heading); // frozen: same node, never re-rendered
    expect(container.querySelector("p")?.textContent).toBe("first paragraph continues");
    expect(container.querySelector("li")?.textContent).toBe("item");
  });

  it("produces the same DOM as a one-shot render after finish()", () => {
    const frames = manualFrames();
    const container = document.createElement("div");
    const stream = createMarkdownStream(container, frames.schedule, frames.cancel);
    const text = "intro **bold**\n\n```\ncode\n```\n| a |\n| - |\n| 1 |\n\nend";
    for (const ch of text) stream.append(ch);
    stream.finish();
    const blocks = [...container.querySelectorAll(".md-block")].map((b) => b.innerHTML).join("");
    const oneShot = document.createElement("div");
    const full = createMarkdownStream(oneShot, frames.schedule, frames.cancel);
    full.append(text);
    full.finish();
    expect(blocks).toBe(
      [...oneShot.querySelectorAll(".md-block")].map((b) => b.innerHTML).join(""),
    );
    expect(container.textContent).toContain("bold");
  });
});
