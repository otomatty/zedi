/**
 * APNG（Animated PNG）判定ユーティリティ
 *
 * APNG は MIME type が `image/png` のため、静止画 PNG と区別がつかない。
 * WebP 変換時にアニメーションを失わないよう、acTL（Animation Control）チャンクの
 * 有無でアニメーション PNG を判定する。
 *
 * @see https://github.com/otomatty/zedi/issues/264
 * @see https://www.w3.org/TR/png/#5ChunkOrdering
 */

// PNG シグネチャ（先頭 8 バイト）
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG ファイルがアニメーション（APNG）かどうかを判定する。
 *
 * 仕様上、APNG の acTL チャンクは最初の IDAT チャンクより前に置かれる。
 * そのため acTL を IDAT より先に見つければ APNG、IDAT を先に見つければ静止画と判定する。
 *
 * PNG 以外・破損データ・判定不能な場合は false を返す（変換は通常どおり行われる）。
 *
 * @param file 判定対象（image/png を想定）
 * @returns APNG なら true
 */
export async function isAnimatedPng(file: File | Blob): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // PNG シグネチャを満たさなければ PNG ではない
    if (bytes.length < PNG_SIGNATURE.length) {
      return false;
    }
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        return false;
      }
    }

    const view = new DataView(buffer);
    // シグネチャの後ろからチャンク（length: 4B, type: 4B, data, CRC: 4B）を走査する
    let offset = PNG_SIGNATURE.length;
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7],
      );

      if (type === "acTL") {
        return true;
      }
      // acTL は IDAT より前に現れる。IDAT に達したら APNG ではない
      if (type === "IDAT") {
        return false;
      }

      // 次のチャンクへ: length(4) + type(4) + data(length) + CRC(4)
      offset += 12 + length;
    }

    return false;
  } catch {
    return false;
  }
}
