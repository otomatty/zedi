import { describe, expect, it } from "vitest";
import {
  extractArgsAfterPrefix,
  matchAgentSlashByQuery,
  resolveArgsForSelectedAgent,
  shouldOfferPathCompletion,
} from "./parseAgentSlashQuery";

describe("extractArgsAfterPrefix", () => {
  it("returns text after prefix", () => {
    expect(extractArgsAfterPrefix("analyze", "analyze src/foo")).toBe("src/foo");
  });

  it("returns empty when only prefix", () => {
    expect(extractArgsAfterPrefix("analyze", "analyze")).toBe("");
  });
});

describe("matchAgentSlashByQuery", () => {
  it("matches analyze with path", () => {
    const m = matchAgentSlashByQuery("analyze src/lib.ts");
    expect(m?.id).toBe("agent-analyze");
    expect(m?.args).toBe("src/lib.ts");
  });

  it("matches git alias", () => {
    const m = matchAgentSlashByQuery("git");
    expect(m?.id).toBe("agent-git-summary");
  });

  it("matches partial prefix", () => {
    const m = matchAgentSlashByQuery("anal");
    expect(m?.id).toBe("agent-analyze");
  });

  it("returns null for empty", () => {
    expect(matchAgentSlashByQuery("")).toBeNull();
  });
});

describe("resolveArgsForSelectedAgent", () => {
  it("resolves args from primary prefix", () => {
    expect(resolveArgsForSelectedAgent("analyze", undefined, "analyze path")).toBe("path");
  });

  it("resolves args from alias git", () => {
    expect(resolveArgsForSelectedAgent("git-summary", ["git"], "git log")).toBe("log");
  });
});

describe("shouldOfferPathCompletion", () => {
  it("is true when path command has space", () => {
    expect(shouldOfferPathCompletion("analyze ")).toBe(true);
  });

  it("is false without space", () => {
    expect(shouldOfferPathCompletion("analyze")).toBe(false);
  });
});
