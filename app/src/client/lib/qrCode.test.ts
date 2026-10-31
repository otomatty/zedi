import { describe, expect, it } from "vitest";
import { qrCode } from "./qrCode";

describe("qrCode", () => {
  it("lays out a version 1 code with a four-module quiet zone", () => {
    const { size } = qrCode("HELLO");
    expect(size).toBe(21 + 2 * 4);
  });

  it("draws one square per dark module, starting with the top-left finder pattern", () => {
    const { path } = qrCode("HELLO");
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
    // The finder pattern's light ring: module (5, 5) is never drawn.
    expect(path).not.toContain("M5 5h");
  });

  it("grows with longer input such as an otpauth URI", () => {
    const uri =
      "otpauth://totp/Zedi:alice%40test.zedi-note.app?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Zedi&algorithm=SHA1&digits=6&period=30";
    expect(qrCode(uri).size).toBeGreaterThan(29);
  });
});
