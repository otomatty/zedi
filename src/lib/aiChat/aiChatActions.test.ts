import { describe, it, expect } from "vitest";
import { parseActions, getDisplayContent } from "./aiChatActions";

describe("parseActions", () => {
  it("extracts single action from content", () => {
    const content = `Here is some text
<!-- zedi-action:create-page -->
{"type":"create-page","title":"New Page","content":"Hello","suggestedLinks":[],"reason":"test"}
<!-- /zedi-action -->
More text`;

    const actions = parseActions(content);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("create-page");
    expect(actions[0]).toHaveProperty("title", "New Page");
  });

  it("extracts multiple actions", () => {
    const content = `Text before
<!-- zedi-action:create-page -->
{"type":"create-page","title":"Page 1","content":"A","suggestedLinks":[],"reason":"r1"}
<!-- /zedi-action -->
Middle text
<!-- zedi-action:suggest-wiki-links -->
{"type":"suggest-wiki-links","links":[{"keyword":"test"}],"reason":"r2"}
<!-- /zedi-action -->
Text after`;

    const actions = parseActions(content);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("create-page");
    expect(actions[1].type).toBe("suggest-wiki-links");
  });

  it("returns empty array for no actions", () => {
    const content = "Just some regular text without any action blocks.";
    expect(parseActions(content)).toEqual([]);
  });

  it("skips invalid JSON in action blocks", () => {
    const content = `Text
<!-- zedi-action:create-page -->
{invalid json here}
<!-- /zedi-action -->
<!-- zedi-action:create-page -->
{"type":"create-page","title":"Valid","content":"ok","suggestedLinks":[],"reason":"r"}
<!-- /zedi-action -->`;

    const actions = parseActions(content);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveProperty("title", "Valid");
  });
});

describe("getDisplayContent", () => {
  it("removes action blocks from text", () => {
    const content = `Here is visible text
<!-- zedi-action:create-page -->
{"type":"create-page","title":"Page","content":"c","suggestedLinks":[],"reason":"r"}
<!-- /zedi-action -->
More visible text`;

    const display = getDisplayContent(content);
    expect(display).not.toContain("zedi-action");
    expect(display).not.toContain("create-page");
    expect(display).toContain("Here is visible text");
    expect(display).toContain("More visible text");
  });

  it("preserves text outside action blocks", () => {
    const content = `Introduction paragraph.
<!-- zedi-action:create-page -->
{"type":"create-page","title":"T","content":"c","suggestedLinks":[],"reason":"r"}
<!-- /zedi-action -->
Conclusion paragraph.`;

    const display = getDisplayContent(content);
    expect(display).toContain("Introduction paragraph.");
    expect(display).toContain("Conclusion paragraph.");
  });

  it("handles content with no actions", () => {
    const content = "Plain text with no actions at all.";
    expect(getDisplayContent(content)).toBe("Plain text with no actions at all.");
  });
});
