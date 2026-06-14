/**
 * Tests for admin build environment helpers.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { getAdminEnvironmentLabel, isNonProductionAdminBuild } from "./adminEnvironment.js";

describe("adminEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns development when VITE_ENV_LABEL is development", () => {
    vi.stubEnv("VITE_ENV_LABEL", "development");
    expect(getAdminEnvironmentLabel()).toBe("development");
    expect(isNonProductionAdminBuild()).toBe(true);
  });

  it("returns production when VITE_ENV_LABEL is production", () => {
    vi.stubEnv("VITE_ENV_LABEL", "production");
    expect(getAdminEnvironmentLabel()).toBe("production");
    expect(isNonProductionAdminBuild()).toBe(false);
  });

  it("returns null when VITE_ENV_LABEL is unset", () => {
    vi.stubEnv("VITE_ENV_LABEL", "");
    expect(getAdminEnvironmentLabel()).toBeNull();
    expect(isNonProductionAdminBuild()).toBe(false);
  });
});
