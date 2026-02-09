/**
 * メディア API: POST /api/media/upload（Presigned URL）、POST /api/media/confirm
 * C1-8: S3 にクライアントが直接 PUT するための URL 発行と、media テーブルへの登録。
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";
import * as res from "../responses.mjs";
import { execute } from "../lib/db.mjs";

const PRESIGNED_EXPIRES_IN = 900; // 15 min

const GET_USER_ID_SQL = `
SELECT id FROM users WHERE cognito_sub = :cognito_sub
`;

const INSERT_MEDIA_SQL = `
INSERT INTO media (id, owner_id, page_id, s3_key, file_name, content_type, file_size)
VALUES (:id, :owner_id, :page_id, :s3_key, :file_name, :content_type, :file_size)
RETURNING id, owner_id, page_id, s3_key, file_name, content_type, file_size, created_at
`;

function getS3Client() {
  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket) throw new Error("MEDIA_BUCKET is not set");
  return new S3Client({});
}

/**
 * JWT claims から owner_id (users.id UUID) を取得する
 * @param {{ sub: string }} claims
 * @returns {Promise<string|null>}
 */
async function getOwnerId(claims) {
  const sub = claims?.sub;
  if (!sub) return null;
  const rows = await execute(GET_USER_ID_SQL, { cognito_sub: sub });
  return rows[0]?.id ?? null;
}

/**
 * UUID v4 を生成（Node 20 crypto.randomUUID）
 * @returns {string}
 */
function randomUUID() {
  return crypto.randomUUID();
}

/**
 * POST /api/media/upload
 * Body: { file_name?, content_type? }
 * Returns: { upload_url, media_id, s3_key, expires_in }
 * クライアントは upload_url に PUT でファイルをアップロードし、完了後に POST /api/media/confirm を呼ぶ。
 */
export async function upload(claims, body = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket) return res.error("Media upload not configured", 503, "CONFIG");

  const mediaId = randomUUID();
  const s3Key = `media/${ownerId}/${mediaId}`;
  const contentType = body?.content_type ?? body?.contentType ?? "application/octet-stream";

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGNED_EXPIRES_IN });

  return res.success({
    upload_url: uploadUrl,
    media_id: mediaId,
    s3_key: s3Key,
    expires_in: PRESIGNED_EXPIRES_IN,
  });
}

/**
 * POST /api/media/confirm
 * Body: { media_id, s3_key, file_name?, content_type?, file_size?, page_id? }
 * upload で取得した media_id / s3_key でアップロード完了を通知し、media テーブルに登録する。
 * s3_key は media/{owner_id}/{media_id} 形式である必要がある。
 */
export async function confirm(claims, body = {}) {
  const ownerId = await getOwnerId(claims);
  if (!ownerId) return res.unauthorized("User not found");

  const mediaId = (body?.media_id ?? body?.mediaId ?? "").trim();
  const s3Key = (body?.s3_key ?? body?.s3Key ?? "").trim();
  if (!mediaId || !s3Key) return res.badRequest("media_id and s3_key are required");

  const expectedPrefix = `media/${ownerId}/${mediaId}`;
  if (s3Key !== expectedPrefix) {
    return res.forbidden("s3_key does not match media_id for this user");
  }

  const fileName = body?.file_name ?? body?.fileName ?? null;
  const contentType = body?.content_type ?? body?.contentType ?? null;
  const fileSize = body?.file_size ?? body?.fileSize ?? null;
  const pageId = body?.page_id ?? body?.pageId ?? null;

  const rows = await execute(INSERT_MEDIA_SQL, {
    id: mediaId,
    owner_id: ownerId,
    page_id: pageId || null,
    s3_key: s3Key,
    file_name: fileName || null,
    content_type: contentType || null,
    file_size: fileSize != null ? Number(fileSize) : null,
  });
  const row = rows[0];
  if (!row) return res.error("Failed to register media", 500, "DB_ERROR");

  return res.success({
    id: row.id,
    owner_id: row.owner_id,
    page_id: row.page_id ?? null,
    s3_key: row.s3_key,
    file_name: row.file_name ?? null,
    content_type: row.content_type ?? null,
    file_size: row.file_size ?? null,
    created_at: row.created_at,
  });
}
