/**
 * `resolveWebSearchModelId` unit tests (#1033).
 * Priority: fixed Wiki Compose model → env override → cheapest OpenAI/Google.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIKI_COMPOSE_MODEL_ID } from "../../../../agents/core/llm/wikiComposeModelId.js";
import { resolveWebSearchModelId } from "../../../../agents/core/tools/resolveWebSearchModel.js";
import { createMockDb } from "../../../createMockDb.js";

const ENV_KEY = "WIKI_COMPOSE_WEB_SEARCH_MODEL_ID";

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveWebSearchModelId", () => {
  it("returns the fixed Wiki Compose model when active and tier-accessible", async () => {
    const { db } = createMockDb([[{ id: WIKI_COMPOSE_MODEL_ID }]]);
    const id = await resolveWebSearchModelId(db as never, "free");
    expect(id).toBe(WIKI_COMPOSE_MODEL_ID);
  });

  it("validates env override against active + tier before returning it", async () => {
    vi.stubEnv(ENV_KEY, "openai:gpt-4o-mini");
    const { db } = createMockDb([[], [{ id: "openai:gpt-4o-mini" }]]);
    const id = await resolveWebSearchModelId(db as never, "free");
    expect(id).toBe("openai:gpt-4o-mini");
  });

  it("falls through when env override is inactive and picks cheapest OpenAI among ties", async () => {
    vi.stubEnv(ENV_KEY, "openai:inactive-model");
    const { db } = createMockDb([
      [],
      [],
      [
        {
          id: "google:cheap",
          provider: "google",
          inputCostUnits: 1,
          outputCostUnits: 1,
        },
        {
          id: "openai:cheap",
          provider: "openai",
          inputCostUnits: 1,
          outputCostUnits: 1,
        },
      ],
    ]);
    const id = await resolveWebSearchModelId(db as never, "pro");
    expect(id).toBe("openai:cheap");
  });

  it("returns null when no active OpenAI/Google models exist", async () => {
    const { db } = createMockDb([[], []]);
    const id = await resolveWebSearchModelId(db as never, "free");
    expect(id).toBeNull();
  });
});
