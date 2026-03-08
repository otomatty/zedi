/**
 * 画像を WebP 形式に変換するユーティリティ
 * ストレージ節約のため、アップロード前にクライアント側で変換する
 *
 * @see https://github.com/otomatty/zedi/issues/256
 */

const WEBP_QUALITY = 0.82; // 80〜85 程度（容量と画質のバランス）

/**
 * 画像ファイルを WebP 形式に変換する
 *
 * - 既に WebP の場合はそのまま返す
 * - アニメーション GIF は静止画（1フレーム目）として WebP に変換
 * - canvas.toBlob('image/webp') が非対応の環境では元のファイルを返す
 *
 * @param file 画像ファイル
 * @returns WebP 形式の File、または変換失敗時は元の File
 */
export async function convertToWebP(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.type === "image/webp") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
    });

    if (!blob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
