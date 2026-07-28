/**
 * `@aws-sdk` presign の workerd 動作確認（#1091 FR-4.1 / TS-5）。
 *
 * presign は純粋な署名計算（ネットワーク不要）のため、ダミー資格情報で
 * `nodejs_compat` 下の workerd 上で URL が生成できることを確認する。
 * Verifies S3-compatible presigned-URL generation works under workerd's
 * nodejs_compat with dummy credentials (pure signing, no network).
 */
import { describe, it, expect } from "vitest";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("@aws-sdk presign on workerd (FR-4.1)", () => {
  it("generates a signed URL with the R2 S3-compatible endpoint shape", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://0123456789abcdef.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
    });
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: "zedi-storage-dev", Key: "media/example.png" }),
      { expiresIn: 60 },
    );
    expect(url).toContain("zedi-storage-dev");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Expires=60");
  });
});
