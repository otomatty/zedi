import { describe, expect, it } from "vitest";
import { isDevelopment } from "./env";

describe("isDevelopment", () => {
  it("is on only when ENVIRONMENT is exactly `development`", () => {
    expect(isDevelopment({ ENVIRONMENT: "development" })).toBe(true);
    expect(isDevelopment({ ENVIRONMENT: "production" })).toBe(false);
    expect(isDevelopment({})).toBe(false);
  });
});
