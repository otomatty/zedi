/**
 * modelResolverService.ts のテスト。
 * Tests for modelResolverService.
 */
import { describe, it, expect } from "vitest";
import {
  isModelTierAccessible,
  isModelUsable,
  resolveSystemDefaultModelId,
  resolveModelAccessWithFallback,
} from "../../services/modelResolverService.js";
import { createMockDb } from "../createMockDb.js";
import type { Database } from "../../types/index.js";

function asDb(results: unknown[]) {
  const { db } = createMockDb(results);
  return db as unknown as Database;
}

const baseModel = {
  id: "google:gemini-flash",
  provider: "google",
  modelId: "gemini-flash",
  displayName: "Gemini Flash",
  tierRequired: "free" as const,
  inputCostUnits: 1,
  outputCostUnits: 1,
  isActive: true,
  isSystemDefault: false,
  sortOrder: 1,
  createdAt: new Date(),
};

describe("isModelTierAccessible", () => {
  it("allows free models for free tier", () => {
    expect(isModelTierAccessible({ tierRequired: "free" }, "free")).toBe(true);
  });

  it("blocks pro models for free tier", () => {
    expect(isModelTierAccessible({ tierRequired: "pro" }, "free")).toBe(false);
  });

  it("allows pro models for pro tier", () => {
    expect(isModelTierAccessible({ tierRequired: "pro" }, "pro")).toBe(true);
  });
});

describe("resolveSystemDefaultModelId", () => {
  it("returns configured system default when active and tier-accessible", async () => {
    const db = asDb([
      [
        { ...baseModel, id: "openai:gpt", sortOrder: 0 },
        { ...baseModel, id: "google:default", isSystemDefault: true, sortOrder: 1 },
      ],
    ]);

    const id = await resolveSystemDefaultModelId("free", db);
    expect(id).toBe("google:default");
  });

  it("falls back to first sortOrder model when configured default is pro-only for free tier", async () => {
    const db = asDb([
      [
        { ...baseModel, id: "openai:free", sortOrder: 0 },
        {
          ...baseModel,
          id: "openai:pro",
          tierRequired: "pro" as const,
          isSystemDefault: true,
          sortOrder: 1,
        },
      ],
    ]);

    const id = await resolveSystemDefaultModelId("free", db);
    expect(id).toBe("openai:free");
  });

  it("returns null when no active models exist", async () => {
    const db = asDb([[]]);
    const id = await resolveSystemDefaultModelId("free", db);
    expect(id).toBeNull();
  });
});

describe("resolveModelAccessWithFallback", () => {
  it("uses requested model when active and accessible", async () => {
    const db = asDb([
      [
        { ...baseModel, id: "openai:a" },
        { ...baseModel, id: "google:b", isSystemDefault: true },
      ],
    ]);

    const result = await resolveModelAccessWithFallback("openai:a", "free", db);
    expect(result.modelId).toBe("openai:a");
    expect(result.didFallback).toBe(false);
  });

  it("falls back to system default when requested model is inactive", async () => {
    const db = asDb([[{ ...baseModel, id: "google:default", isSystemDefault: true }]]);

    const result = await resolveModelAccessWithFallback("openai:missing", "free", db);
    expect(result.modelId).toBe("google:default");
    expect(result.didFallback).toBe(true);
  });

  it("falls back to system default when requested model requires pro tier", async () => {
    const db = asDb([
      [
        {
          ...baseModel,
          id: "openai:pro-only",
          tierRequired: "pro" as const,
        },
        { ...baseModel, id: "google:default", isSystemDefault: true },
      ],
    ]);

    const result = await resolveModelAccessWithFallback("openai:pro-only", "free", db);
    expect(result.modelId).toBe("google:default");
    expect(result.didFallback).toBe(true);
  });

  it("uses first available model when no system default is configured", async () => {
    const db = asDb([
      [
        { ...baseModel, id: "openai:first", sortOrder: 0 },
        { ...baseModel, id: "google:second", sortOrder: 1 },
      ],
    ]);

    const result = await resolveModelAccessWithFallback(null, "free", db);
    expect(result.modelId).toBe("openai:first");
    expect(result.didFallback).toBe(false);
  });

  it("throws when no models are available for tier", async () => {
    const db = asDb([[{ ...baseModel, tierRequired: "pro" as const }]]);

    await expect(resolveModelAccessWithFallback(null, "free", db)).rejects.toThrow(
      /No available model/i,
    );
  });
});

describe("isModelUsable", () => {
  it("requires active and tier-accessible", () => {
    expect(isModelUsable({ isActive: true, tierRequired: "free" }, "free")).toBe(true);
    expect(isModelUsable({ isActive: false, tierRequired: "free" }, "free")).toBe(false);
    expect(isModelUsable({ isActive: true, tierRequired: "pro" }, "free")).toBe(false);
  });
});
