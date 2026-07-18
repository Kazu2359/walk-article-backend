import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function buildAudioStorageKey(userId: string, recordingId: string): string {
  return `audio/${userId}/${recordingId}.m4a`;
}

export async function createUploadUrl(
  storageKey: string,
): Promise<{ uploadUrl: string; expiresIn: number }> {
  const command = new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: storageKey });
  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { uploadUrl, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

export async function deleteAudioObject(storageKey: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: storageKey }));
}

export async function downloadAudioObject(storageKey: string): Promise<Buffer> {
  const result = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: storageKey }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`R2オブジェクトの取得に失敗しました: ${storageKey}`);
  }
  return Buffer.from(bytes);
}
