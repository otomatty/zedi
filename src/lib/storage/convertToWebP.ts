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

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
            const webpFile = new File([blob], `${baseName}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(webpFile);
          },
          "image/webp",
          WEBP_QUALITY,
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
