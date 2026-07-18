import { describe, expect, it } from "vitest";
import { parseWorkerEnvFile } from "./parseWorkerEnvFile.js";

describe("parseWorkerEnvFile", () => {
  it("parses KEY=VALUE pairs and skips comments and blanks", () => {
    const text = `
# comment
STORAGE_ENDPOINT=https://example.r2.cloudflarestorage.com

STORAGE_BUCKET_NAME=zedi-storage-dev
export STORAGE_ACCESS_KEY=akid
STORAGE_SECRET_KEY="secret with spaces"
EMPTY_SKIP=
`;
    expect(parseWorkerEnvFile(text)).toEqual([
      { name: "STORAGE_ENDPOINT", value: "https://example.r2.cloudflarestorage.com" },
      { name: "STORAGE_BUCKET_NAME", value: "zedi-storage-dev" },
      { name: "STORAGE_ACCESS_KEY", value: "akid" },
      { name: "STORAGE_SECRET_KEY", value: "secret with spaces" },
    ]);
  });

  it("rejects lines without KEY=VALUE", () => {
    expect(() => parseWorkerEnvFile("NOT_A_PAIR")).toThrow(/invalid/i);
  });
});
