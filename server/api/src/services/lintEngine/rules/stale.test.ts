/**
 * Stale lint rule の純関数ユニットテスト。
 * Unit tests for the pure stale-fold helper.
 */
import { describe, it, expect } from "vitest";
import { foldStaleRowsIntoFindings, type StaleRow } from "./stale.js";
import type { LintFindingCandidate } from "../types.js";

const makeRow = (overrides: Partial<StaleRow> = {}): StaleRow => ({
  page_id: "p1",
  title: "Page One",
  page_updated_at: new Date("2026-04-01T00:00:00Z"),
  source_id: "s1",
  source_title: "Source 1",
  source_url: "https://example.com/1",
  source_extracted_at: new Date("2026-04-10T00:00:00Z"),
  ...overrides,
});

/**
 * Asserts `value` is defined and narrows its type.
 * 値が undefined でないことを検証して型を絞り込む。
 */
function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("foldStaleRowsIntoFindings", () => {
  it("returns empty when there are no stale rows", () => {
    expect(foldStaleRowsIntoFindings([])).toEqual([]);
  });

  it("collapses multiple stale sources for the same page into a single finding", () => {
    const rows: StaleRow[] = [
      makeRow({ source_id: "s1", source_extracted_at: new Date("2026-04-02T00:00:00Z") }),
      makeRow({ source_id: "s2", source_extracted_at: new Date("2026-04-05T00:00:00Z") }),
      makeRow({ source_id: "s3", source_extracted_at: new Date("2026-04-03T00:00:00Z") }),
    ];
    const findings = foldStaleRowsIntoFindings(rows);
    expect(findings).toHaveLength(1);
    const finding: LintFindingCandidate = must(findings[0], "expected 1 finding");
    expect(finding.rule).toBe("stale");
    expect(finding.severity).toBe("warn");
    expect(finding.pageIds).toEqual(["p1"]);
    const stale = finding.detail.staleSources as Array<{ sourceId: string }>;
    // sorted by newest extracted_at first
    expect(stale.map((s) => s.sourceId)).toEqual(["s2", "s3", "s1"]);
  });

  it("produces one finding per page", () => {
    const rows: StaleRow[] = [
      makeRow({ page_id: "p1", title: "P1" }),
      makeRow({ page_id: "p2", title: "P2" }),
    ];
    const findings = foldStaleRowsIntoFindings(rows);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.pageIds[0]).sort()).toEqual(["p1", "p2"]);
  });

  it("falls back to '(無題 / untitled)' when title is null", () => {
    const findings = foldStaleRowsIntoFindings([makeRow({ title: null })]);
    const finding: LintFindingCandidate = must(findings[0], "expected 1 finding");
    expect(finding.detail.title).toBe("(無題 / untitled)");
  });

  it("serializes dates as ISO 8601 strings", () => {
    const findings = foldStaleRowsIntoFindings([makeRow()]);
    const finding: LintFindingCandidate = must(findings[0], "expected 1 finding");
    expect(finding.detail.pageUpdatedAt).toBe("2026-04-01T00:00:00.000Z");
    const stale = finding.detail.staleSources as Array<{ extractedAt: string }>;
    const first = must(stale[0], "expected stale source");
    expect(first.extractedAt).toBe("2026-04-10T00:00:00.000Z");
  });
});
