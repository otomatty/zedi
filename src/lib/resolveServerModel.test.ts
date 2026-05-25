import { describe, it, expect } from "vitest";
import { resolvePreferredServerModel, resolveServerInitialSelection } from "./resolveServerModel";
import type { AIModel } from "@/types/ai";

function model(id: string): AIModel {
  return {
    id,
    provider: "google",
    modelId: id.split(":")[1] ?? id,
    displayName: id,
    tierRequired: "free",
    available: true,
    inputCostUnits: 1,
    outputCostUnits: 1,
  };
}

describe("resolvePreferredServerModel", () => {
  const available = [model("openai:a"), model("google:b"), model("google:default")];

  it("prefers current selection when still available", () => {
    const picked = resolvePreferredServerModel(available, {
      currentId: "google:b",
      savedModelId: "openai:a",
      systemDefaultModelId: "google:default",
    });
    expect(picked?.id).toBe("google:b");
  });

  it("falls back to saved model when current is unavailable", () => {
    const picked = resolvePreferredServerModel(available, {
      currentId: "openai:removed",
      savedModelId: "openai:a",
      systemDefaultModelId: "google:default",
    });
    expect(picked?.id).toBe("openai:a");
  });

  it("uses system default when saved model is unavailable", () => {
    const picked = resolvePreferredServerModel(available, {
      savedModelId: "openai:removed",
      systemDefaultModelId: "google:default",
    });
    expect(picked?.id).toBe("google:default");
  });

  it("uses first available when nothing else matches", () => {
    const picked = resolvePreferredServerModel(available, {
      savedModelId: "missing",
      systemDefaultModelId: "also-missing",
    });
    expect(picked?.id).toBe("openai:a");
  });
});

describe("resolveServerInitialSelection", () => {
  const available = [model("openai:a"), model("google:default")];

  it("returns undefined when current selection is still valid", () => {
    expect(
      resolveServerInitialSelection(
        available,
        { id: "openai:a" },
        "google:default",
        "google:default",
      ),
    ).toBeUndefined();
  });

  it("returns fallback when current selection is missing", () => {
    const picked = resolveServerInitialSelection(
      available,
      { id: "openai:removed" },
      "openai:removed",
      "google:default",
    );
    expect(picked?.id).toBe("google:default");
  });
});
