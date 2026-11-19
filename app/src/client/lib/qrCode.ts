import { encode } from "uqr";

/** Quiet zone around the code, in modules (the QR specification asks for four). */
const QUIET_ZONE = 4;

/**
 * A QR code as an SVG path: one 1×1 square per dark module, in a `size`×`size` view box.
 * QR コードを SVG のパスにする（暗いモジュールごとに 1×1 の四角）。
 */
export function qrCode(text: string): { size: number; path: string } {
  const { size, data } = encode(text, { border: QUIET_ZONE, ecc: "M" });
  let path = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { size, path };
}
