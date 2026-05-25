import { describe, expect, it } from "vitest";
import { resolveWebSearchExecutionBackend } from "../../../../agents/core/types/executionBackend.js";

describe("resolveWebSearchExecutionBackend", () => {
  it("uses zedi_managed for zedi_managed sessions", () => {
    expect(resolveWebSearchExecutionBackend("zedi_managed", "openai")).toBe("zedi_managed");
  });

  it("uses session backend when provider matches", () => {
    expect(resolveWebSearchExecutionBackend("user_openai", "openai")).toBe("user_openai");
  });

  it("uses cross-provider BYOK credential when session is another provider", () => {
    expect(resolveWebSearchExecutionBackend("user_anthropic", "openai")).toBe("user_openai");
  });
});
