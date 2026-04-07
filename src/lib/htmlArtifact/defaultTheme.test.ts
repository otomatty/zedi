import { describe, it, expect } from "vitest";
import {
  LIGHT_THEME_VARS,
  DARK_THEME_VARS,
  SVG_DIAGRAM_STYLES,
  buildCssVarBlock,
} from "./defaultTheme";

describe("defaultTheme", () => {
  describe("LIGHT_THEME_VARS", () => {
    it("should contain essential CSS variables", () => {
      expect(LIGHT_THEME_VARS["--color-text-secondary"]).toBeDefined();
      expect(LIGHT_THEME_VARS["--color-border-tertiary"]).toBeDefined();
      expect(LIGHT_THEME_VARS["--border-radius-md"]).toBeDefined();
      expect(LIGHT_THEME_VARS["--font-mono"]).toBeDefined();
    });

    it("should have string values for all variables", () => {
      for (const [key, value] of Object.entries(LIGHT_THEME_VARS)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
        expect(key.startsWith("--")).toBe(true);
      }
    });
  });

  describe("DARK_THEME_VARS", () => {
    it("should contain essential CSS variables", () => {
      expect(DARK_THEME_VARS["--color-text-secondary"]).toBeDefined();
      expect(DARK_THEME_VARS["--color-border-tertiary"]).toBeDefined();
    });

    it("should differ from light theme in color values", () => {
      expect(DARK_THEME_VARS["--color-text-primary"]).not.toBe(
        LIGHT_THEME_VARS["--color-text-primary"],
      );
      expect(DARK_THEME_VARS["--color-bg-primary"]).not.toBe(
        LIGHT_THEME_VARS["--color-bg-primary"],
      );
    });
  });

  describe("buildCssVarBlock", () => {
    it("should produce valid CSS variable declarations", () => {
      const result = buildCssVarBlock({ "--color-a": "red", "--color-b": "blue" });
      expect(result).toContain("--color-a: red;");
      expect(result).toContain("--color-b: blue;");
    });

    it("should return empty string for empty input", () => {
      expect(buildCssVarBlock({})).toBe("");
    });

    it("should indent each line with two spaces", () => {
      const result = buildCssVarBlock({ "--x": "1" });
      expect(result).toBe("  --x: 1;");
    });
  });

  describe("SVG_DIAGRAM_STYLES", () => {
    it("should define Claude diagram color classes", () => {
      expect(SVG_DIAGRAM_STYLES).toContain(".c-blue");
      expect(SVG_DIAGRAM_STYLES).toContain(".c-coral");
      expect(SVG_DIAGRAM_STYLES).toContain(".c-teal");
      expect(SVG_DIAGRAM_STYLES).toContain(".c-purple");
      expect(SVG_DIAGRAM_STYLES).toContain(".c-amber");
      expect(SVG_DIAGRAM_STYLES).toContain(".c-green");
    });

    it("should define text helper classes", () => {
      expect(SVG_DIAGRAM_STYLES).toContain("text.th");
      expect(SVG_DIAGRAM_STYLES).toContain("text.ts");
    });
  });
});
