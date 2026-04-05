import { describe, it, expect } from "vitest";
import { stripSensitiveConfigForPersist } from "./mcpConfigStore";

describe("stripSensitiveConfigForPersist", () => {
  it("drops env for stdio", () => {
    const c = stripSensitiveConfigForPersist({
      type: "stdio",
      command: "npx",
      args: ["a"],
      env: { TOKEN: "secret" },
    });
    expect(c).toEqual({ type: "stdio", command: "npx", args: ["a"] });
  });

  it("drops headers for http", () => {
    const c = stripSensitiveConfigForPersist({
      type: "http",
      url: "https://x/mcp",
      headers: { h: "v" },
    });
    expect(c).toEqual({ type: "http", url: "https://x/mcp" });
  });
});
