// ストレージプロバイダーのインターフェース定義

/**
 * アップロードオプション
 */
export interface UploadOptions {
  fileName?: string;
  folder?: string;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * アップロード進捗
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * 接続テスト結果
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * ストレージプロバイダーインターフェース
 */
export interface StorageProviderInterface {
  /**
   * プロバイダー名
   */
  readonly name: string;

  /**
   * 画像をアップロードしてURLを返す
   */
  uploadImage(file: File, options?: UploadOptions): Promise<string>;

  /**
   * 接続テストを実行
   */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * 画像を削除（オプション）
   */
  deleteImage?(url: string): Promise<void>;
}

/**
 * 画像ファイルかどうかを判定
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * ファイル名を生成（タイムスタンプ + ランダム文字列）
 */
export function generateFileName(file: File): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = file.name.split(".").pop() || "png";
  return `zedi-${timestamp}-${random}.${extension}`;
}

/**
 * ファイルをBase64に変換
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Data URLからBase64部分のみを抽出
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
